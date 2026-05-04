const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

(async () => {
  try {
    // Check specific book: "Probability and Stochastic Processes"
    const bookId = '6ef24b5e-e05b-4b71-a4d4-e87f78e73930';
    const book = await pool.query('SELECT id, title, avg_rating, rating_count FROM books WHERE id = $1', [bookId]);
    console.log('📚 Book:', book.rows[0]);
    
    if (book.rows[0]) {
      const reviews = await pool.query('SELECT id, user_id, rating, review_text FROM reviews WHERE book_id = $1 ORDER BY created_at DESC', [bookId]);
      console.log('📝 Total reviews in DB:', reviews.rows.length);
      if (reviews.rows.length > 0) {
        console.log('📝 Reviews list:');
        reviews.rows.forEach((r, i) => {
          console.log(`  ${i+1}. User: ${r.user_id}, Rating: ${r.rating}⭐, Text: "${r.review_text}"`);
        });
        
        // Calculate aggregate
        const agg = await pool.query('SELECT ROUND(AVG(rating)::numeric, 2) as avg_rating, COUNT(*) as rating_count FROM reviews WHERE book_id = $1', [bookId]);
        console.log('📊 Calculated from reviews DB:', agg.rows[0]);
      } else {
        console.log('⚠️  No reviews in database for this book');
      }
    }
    
    await pool.end();
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
})();
