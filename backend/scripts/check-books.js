const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const res = await pool.query(`
      SELECT id, title, authors, avg_rating, rating_count 
      FROM books 
      ORDER BY id DESC 
      LIMIT 10
    `);
    console.log('📚 Books in Database:');
    console.log(`Total: ${res.rows.length} books\n`);
    res.rows.forEach(b => {
      console.log(`  • ID: ${b.id}`);
      console.log(`    Title: ${b.title}`);
      console.log(`    Authors: ${b.authors}`);
      console.log(`    Rating: ${b.avg_rating}⭐ (${b.rating_count} votes)\n`);
    });
    await pool.end();
  } catch(e) {
    console.error('Error:', e.message);
  }
})();
