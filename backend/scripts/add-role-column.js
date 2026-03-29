// Add role column to users table in Azure SQL
const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    }
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30000
  }
};

const pool = new sql.ConnectionPool(config);

async function addRoleColumn() {
  try {
    await pool.connect();
    console.log('✓ Connected to Azure SQL');
    
    // Add role column to users table if not exists
    await pool.request().query(`
      IF NOT EXISTS (SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role')
      BEGIN
        ALTER TABLE users ADD role NVARCHAR(50) DEFAULT 'user';
      END
    `);
    
    console.log('✅ Role column added/verified successfully');
    await pool.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addRoleColumn();
