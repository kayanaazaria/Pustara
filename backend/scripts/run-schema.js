// Run database schema migration
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_5sJYwuacST0b@ep-super-shadow-a8ljl9n1-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require';

const client = new Client({
  connectionString,
});

async function runSchema() {
  try {
    await client.connect();
    console.log('✓ Connected to Neon database');

    // Read schema SQL file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('📋 Running database schema...');
    await client.query(schemaSql);
    console.log('✓ Schema executed successfully');

    // Verify tables created
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n✅ Database tables created:');
    tablesResult.rows.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.table_name}`);
    });

    console.log(`\n✅ Total tables: ${tablesResult.rows.length}`);
    console.log('\n🚀 Database migration completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSchema();
