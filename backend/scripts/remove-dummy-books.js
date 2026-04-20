/**
 * Script: Remove dummy books from database
 * Keeps only real uploaded books (with isbn)
 * 
 * Usage: node scripts/remove-dummy-books.js
 */

require('dotenv').config();
const db = require('../config/database');

async function removeDummyBooks() {
  try {
    console.log('\n🗑️  Removing dummy books from database...\n');

    // Delete books without ISBN (these are dummy/seed books)
    const deleteQuery = `DELETE FROM books WHERE isbn IS NULL RETURNING id, title`;
    const result = await db.executeQuery(deleteQuery, []);

    const deleted = result.rows;

    console.log(`✅ Deleted ${deleted.length} dummy books:\n`);
    deleted.forEach((book, idx) => {
      console.log(`  ${idx + 1}. ${book.title}`);
    });

    if (deleted.length === 0) {
      console.log('  (none found)\n');
    }

    // Show remaining books
    const countQuery = `SELECT COUNT(*) as total FROM books WHERE is_active = true`;
    const countResult = await db.executeQuery(countQuery, []);
    const totalBooks = parseInt(countResult.rows[0].total);

    console.log(`\n📊 Remaining books: ${totalBooks}\n`);

    // List remaining books
    if (totalBooks > 0) {
      const listQuery = `SELECT id, title, isbn, avg_rating FROM books WHERE is_active = true ORDER BY created_at DESC`;
      const listResult = await db.executeQuery(listQuery, []);
      
      console.log('📚 Active books in database:\n');
      listResult.rows.forEach((book, idx) => {
        console.log(`  ${idx + 1}. ${book.title}`);
        console.log(`     ISBN: ${book.isbn || 'N/A'}, Rating: ${book.avg_rating || 'N/A'}\n`);
      });
    }

    console.log('✨ Done!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error removing dummy books:', error);
    process.exit(1);
  }
}

removeDummyBooks();
