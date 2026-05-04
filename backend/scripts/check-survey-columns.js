const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'UserSurvey' 
      ORDER BY ordinal_position
    `);
    console.log('📋 UserSurvey columns:');
    res.rows.forEach(r => console.log('  -', r.column_name, ':', r.data_type));
    await pool.end();
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
