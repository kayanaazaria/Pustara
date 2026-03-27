require('dotenv').config();
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_5sJYwuacST0b@ep-super-shadow-a8ljl9n1-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require';
const client = new Client({ connectionString });

async function dropAll() {
  try {
    await client.connect();
    console.log('🗑️  Dropping all tables...');
    
    await client.query(`
      DROP TABLE IF EXISTS follows CASCADE;
      DROP TABLE IF EXISTS loans CASCADE;
      DROP TABLE IF EXISTS notifications CASCADE;
      DROP TABLE IF EXISTS queue CASCADE;
      DROP TABLE IF EXISTS reviews CASCADE;
      DROP TABLE IF EXISTS user_book_scores CASCADE;
      DROP TABLE IF EXISTS usersurvey CASCADE;
      DROP TABLE IF EXISTS wishlist CASCADE;
      DROP TABLE IF EXISTS books CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);
    
    console.log('✓ All tables dropped');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

dropAll();
