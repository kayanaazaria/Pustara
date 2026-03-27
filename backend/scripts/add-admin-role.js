/**
 * Add admin role support to users table
 * Adds 'role' column with 'user' or 'admin' values
 */

require('dotenv').config();
const { Pool } = require('pg');

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function addAdminRoleToUsers() {
  const client = await pgPool.connect();

  try {
    console.log('🔷 Adding admin role support to users table...\n');

    // Check if role column exists
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'role'
    `);

    if (checkColumn.rows.length === 0) {
      // Add role column
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN role VARCHAR(20) DEFAULT 'user' NOT NULL,
        ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'))
      `);
      console.log('✓ Added role column to users table');
    } else {
      console.log('✓ Role column already exists');
    }

    // Create index for faster admin queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)
    `);
    console.log('✓ Created index on role column');

    // Seed first user as admin (if you want, optional)
    // Uncomment below to make specific user admin
    // await client.query(`
    //   UPDATE users SET role = 'admin' WHERE email = 'admin@example.com' LIMIT 1
    // `);

    console.log('\n✅ Admin role system initialized successfully!');
    console.log('📝 Use this SQL to make a user admin:');
    console.log('   UPDATE users SET role = \'admin\' WHERE email = \'your-email@example.com\'');
  } catch (error) {
    console.error('❌ Error adding admin role:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pgPool.end();
  }
}

addAdminRoleToUsers();
