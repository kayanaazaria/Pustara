const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

(async () => {
  try {
    const bookId = '6ef24b5e-e05b-4b71-a4d4-e87f78e73930';
    
    // Step 1: Calculate aggregate
    const statsQuery = `
      SELECT 
        ROUND(AVG(rating)::numeric, 2) as avg_rating,
        COUNT(*) as rating_count
      FROM reviews
      WHERE book_id = $1
    `;
    const statsResult = await pool.query(statsQuery, [bookId]);
    const stats = statsResult.rows[0];
    console.log('📊 Calculated stats:', stats);
    
    // Step 2: Update books table
    const updateBookQuery = `
      UPDATE books 
      SET avg_rating = $1, rating_count = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING avg_rating, rating_count, id
    `;
    const updateResult = await pool.query(updateBookQuery, [
      parseFloat(stats.avg_rating) || 0,
      parseInt(stats.rating_count) || 0,
      bookId
    ]);
    
    if (updateResult.rows.length > 0) {
      console.log('✅ Book updated:', updateResult.rows[0]);
    } else {
      console.log('❌ Update failed - book not found');
    }
    
    // Step 3: Verify
    const verify = await pool.query('SELECT avg_rating, rating_count FROM books WHERE id = $1', [bookId]);
    console.log('✅ Verification - Book now has:', verify.rows[0]);
    
    await pool.end();
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
})();
