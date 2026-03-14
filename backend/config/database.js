/**
 * Azure SQL Database Connection
 * Manages connection pool to Azure SQL Database
 */

const sql = require('mssql');

// Database configuration
const dbConfig = {
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

let connectionPool = null;

/**
 * Initialize connection pool
 */
async function initializeDatabase() {
  try {
    if (!connectionPool) {
      connectionPool = new sql.ConnectionPool(dbConfig);
      await connectionPool.connect();
      console.log('✅ Azure SQL Database connected');
      return connectionPool;
    }
    return connectionPool;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

/**
 * Get connection pool
 */
function getPool() {
  if (!connectionPool) {
    throw new Error('Database not initialized. Call initializeDatabase() first');
  }
  return connectionPool;
}

/**
 * Create users table (run once)
 */
async function createUsersTable() {
  try {
    const pool = getPool();
    const query = `
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
    `;
    await pool.request().query(query);
    console.log('✅ Users table ready');
  } catch (error) {
    console.error('❌ Error creating users table:', error);
    throw error;
  }
}

/**
 * Create user survey table (run once)
 */
async function createUserSurveyTable() {
  try {
    const pool = getPool();
    const query = `
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
    `;
    await pool.request().query(query);
    console.log('✅ UserSurvey table ready');
  } catch (error) {
    console.error('❌ Error creating survey table:', error);
    throw error;
  }
}

/**
 * Close connection pool
 */
async function closeDatabase() {
  if (connectionPool) {
    await connectionPool.close();
    connectionPool = null;
    console.log('Database connection closed');
  }
}

module.exports = {
  initializeDatabase,
  getPool,
  createUsersTable,
  createUserSurveyTable,
  closeDatabase,
};
