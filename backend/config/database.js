/**
 * Database Configuration & Connection Manager
 * * NODE_ENV=dummy  → Neon PostgreSQL (pg)
 * NODE_ENV=* → Azure SQL (mssql) — production
 */

const isDummy = process.env.NODE_ENV === 'dummy';

// ── 1. Neon / PostgreSQL (Dummy Mode) ─────────────────────────────────────────
let pgPool = null;

async function initNeon() {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'dummy' ? false : { rejectUnauthorized: false },
  });
  
  // Test connection
  const client = await pgPool.connect();
  client.release();
  console.log('✅ Neon PostgreSQL connected (dummy mode)');
  return pgPool;
}

// ── 2. Azure SQL (Production Mode) ────────────────────────────────────────────
const sql = isDummy ? null : require('mssql');

const azureConfig = isDummy ? null : {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    },
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30000,
    requestTimeout: 30000,
  },
};

let azurePool = null;

async function initAzure() {
  if (!azurePool) {
    azurePool = new sql.ConnectionPool(azureConfig);
    await azurePool.connect();
    console.log('✅ Azure SQL Database connected (production)');
  }
  return azurePool;
}

// ── 3. Unified API ────────────────────────────────────────────────────────────

/**
* Initialize DB based on the environment
*/
async function initializeDatabase() {
  try {
    if (isDummy) {
      return await initNeon();
    }
    return await initAzure();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

/**
* Execute query — Abstraction so the service layer doesn't need to know which DB
* Neon: uses $1, $2, ... placeholders
* Azure: automatically converted to @p1, @p2, ...
* Also converts PostgreSQL syntax to T-SQL syntax
*/
async function executeQuery(query, params = []) {
  if (isDummy) {
    if (!pgPool) throw new Error('Neon DB not initialized. Call initializeDatabase() first');
    const result = await pgPool.query(query, params);
    return result.rows;
  }

  // Azure SQL logic
  if (!azurePool) throw new Error('Azure DB not initialized. Call initializeDatabase() first');
  
  let azureQuery = query;
  const request = azurePool.request();

  // Convert placeholders: $1, $2 → @p1, @p2
  params.forEach((val, i) => {
    const paramRegex = new RegExp(`\\$${i + 1}\\b`, 'g');
    azureQuery = azureQuery.replace(paramRegex, `@p${i + 1}`);
    request.input(`p${i + 1}`, val);
  });

  // Convert PostgreSQL syntax to T-SQL syntax
  
  // 1. Convert true/false literals to 1/0
  azureQuery = azureQuery.replace(/\btrue\b/gi, '1');
  azureQuery = azureQuery.replace(/\bfalse\b/gi, '0');
  
  // 2. Convert @pN = ANY(column) to CHARINDEX for JSON arrays
  // Handles: @p1 = ANY(genres), @p2 = ANY(authors) etc
  azureQuery = azureQuery.replace(
    /@p(\d+)\s*=\s*ANY\s*\((\w+)\)/gi,
    (match, paramNum, columnName) => {
      return `CHARINDEX('\"' + @p${paramNum} + '\"', ${columnName}) > 0`;
    }
  );
  
  // 3. Convert LIMIT x OFFSET y to OFFSET y ROWS FETCH NEXT x ROWS ONLY
  // Pattern: LIMIT @pN [OFFSET @pM]
  azureQuery = azureQuery.replace(
    /LIMIT\s+@p(\d+)(?:\s+OFFSET\s+@p(\d+))?/gi,
    (match, limitParam, offsetParam) => {
      if (offsetParam) {
        return `OFFSET @p${offsetParam} ROWS FETCH NEXT @p${limitParam} ROWS ONLY`;
      } else {
        return `OFFSET 0 ROWS FETCH NEXT @p${limitParam} ROWS ONLY`;
      }
    }
  );
  
  // 4. Convert ILIKE to LIKE for case-insensitive search
  azureQuery = azureQuery.replace(/\bILIKE\b/gi, 'LIKE');
  
  const result = await request.query(azureQuery);
  
  // Return in same format as pg library for compatibility
  // Controllers expect result.rows, but mssql uses result.recordset
  return { rows: result.recordset };
}

/**
 * Get raw pool (for cases that require manual transactions)
 */
function getPool() {
  if (isDummy) {
    if (!pgPool) throw new Error('Neon DB not initialized');
    return pgPool;
  }
  if (!azurePool) throw new Error('Azure DB not initialized');
  return azurePool;
}

// ── 4. Bootstrapping Table ────────────────────────────────────────────────────

async function createUsersTable() {
  if (isDummy) {
    console.log('✅ Users table — auto-create di-skip untuk Neon (pakai schema.sql)');
    return;
  }
  
  try {
    const pool = getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Users')
      BEGIN
        CREATE TABLE Users (
          id INT PRIMARY KEY IDENTITY(1,1),
          uid NVARCHAR(255) UNIQUE NOT NULL,
          email NVARCHAR(255) UNIQUE NOT NULL,
          displayName NVARCHAR(255),
          photoURL NVARCHAR(MAX),
          createdAt DATETIME DEFAULT GETDATE(),
          updatedAt DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX idx_email ON Users(email);
        CREATE INDEX idx_uid ON Users(uid);
        PRINT 'Users table created';
      END
    `);
    console.log('✅ Users table ready');
  } catch (error) {
    console.error('❌ Error creating users table:', error);
    throw error;
  }
}

async function createUserSurveyTable() {
  if (isDummy) {
    console.log('✅ UserSurvey — auto-create di-skip untuk Neon');
    return;
  }
  
  try {
    const pool = getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'UserSurvey')
      BEGIN
        CREATE TABLE UserSurvey (
          id INT PRIMARY KEY IDENTITY(1,1),
          userId INT NOT NULL,
          favoriteGenre NVARCHAR(100),
          age NVARCHAR(50),
          gender NVARCHAR(50),
          createdAt DATETIME DEFAULT GETDATE(),
          updatedAt DATETIME DEFAULT GETDATE(),
          FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        );
        CREATE INDEX idx_userId ON UserSurvey(userId);
        PRINT 'UserSurvey table created';
      END
    `);
    console.log('✅ UserSurvey table ready');
  } catch (error) {
    console.error('❌ Error creating survey table:', error);
    throw error;
  }
}

async function closeDatabase() {
  if (isDummy && pgPool) {
    await pgPool.end();
    pgPool = null;
    console.log('Neon Database connection closed');
  } else if (azurePool) {
    await azurePool.close();
    azurePool = null;
    console.log('Azure Database connection closed');
  }
}

module.exports = {
  initializeDatabase,
  executeQuery,
  getPool,
  createUsersTable,
  createUserSurveyTable,
  closeDatabase,
  isDummy,
};