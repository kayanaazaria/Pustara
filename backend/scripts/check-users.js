/**
 * Script untuk check users di Neon database
 */
const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

(async () => {
  try {
    console.log('🔍 Checking users table schema...');
    
    // Check table columns
    const schema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Users table schema:');
    schema.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '[NOT NULL]' : '[nullable]'}`);
    });
    
    // Check users count
    const count = await pool.query('SELECT COUNT(*) FROM users');
    console.log(`\n📊 Total users: ${count.rows[0].count}`);
    
    if (count.rows[0].count > 0) {
      const users = await pool.query('SELECT id, firebase_uid, email, display_name, created_at FROM users LIMIT 10');
      console.log('\n👥 Sample users:');
      users.rows.forEach((u, i) => {
        console.log(`  ${i+1}. ID: ${u.id}, UID: ${u.firebase_uid}, Email: ${u.email}, Name: ${u.display_name}`);
      });
    } else {
      console.log('\n⚠️  No users found in database');
    }
    
    await pool.end();
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
})();
