const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const res = await pool.query(`
      SELECT r.id, r.book_id, r.user_id, r.rating, r.review_text, r.created_at, u.username 
      FROM reviews r 
      LEFT JOIN users u ON r.user_id = u.id 
      ORDER BY r.created_at DESC 
      LIMIT 10
    `);
    console.log('📋 All Reviews in Database:');
    console.log(`Total: ${res.rows.length} reviews\n`);
    res.rows.forEach(r => {
      console.log(`  • Book ID: ${r.book_id} | User: ${r.username} | Rating: ${r.rating}⭐ | Text: "${r.review_text}"`);
    });
    await pool.end();
  } catch(e) {
    console.error('Error:', e.message);
  }
})();
