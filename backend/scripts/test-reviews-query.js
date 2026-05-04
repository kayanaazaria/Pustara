const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const bookId = 'bd904c00-5563-4880-910c-737c1f17afec';
    const limit = 50;
    const offset = 0;

    // Test the exact query from booksController
    const query = `
      SELECT 
        r.id,
        r.user_id,
        r.book_id,
        r.rating,
        r.review_text,
        r.created_at,
        r.updated_at,
        u.username as name,
        SUBSTRING(u.username, 1, 1) as avatar
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.book_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    console.log('Testing query with params:', [bookId, limit, offset]);
    const result = await pool.query(query, [bookId, limit, offset]);
    
    console.log('\n📊 Query Result:');
    console.log('Rows returned:', result.rows.length);
    console.log('First row:', result.rows[0]);
    
    // Also test count query
    const countQuery = 'SELECT COUNT(*) as total FROM reviews WHERE book_id = $1';
    const countResult = await pool.query(countQuery, [bookId]);
    console.log('\n📊 Count Result:');
    console.log('Total reviews:', countResult.rows[0].total);
    
    await pool.end();
  } catch(e) {
    console.error('❌ Error:', e.message);
    console.error('Stack:', e.stack);
  }
})();
