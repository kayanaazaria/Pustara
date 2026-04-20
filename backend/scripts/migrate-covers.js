/**
 * Migration: Update existing books without cover_id
 * Try to fetch cover_id dari OpenLibrary pake title + authors
 * 
 * Usage: node migrate-covers.js
 */

require('dotenv').config();
const db = require('../config/database');
const openLibraryService = require('../services/openLibraryService');

async function migrateCover(book) {
  try {
    // Try search by title + authors
    const searchQuery = `${book.title}`;
    const response = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(searchQuery)}&limit=1`
    );
    
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.docs || data.docs.length === 0) return null;

    const doc = data.docs[0];
    const coverId = doc.cover_i;

    if (coverId) {
      console.log(`✅ Found cover for: ${book.title} (cover_id: ${coverId})`);
      
      // Update database
      const updateQuery = `UPDATE books SET cover_id = $1 WHERE id = $2`;
      await db.executeQuery(updateQuery, [coverId, book.id]);
      
      return coverId;
    } else {
      console.log(`⚠️  No cover found for: ${book.title}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error fetching cover for ${book.title}:`, error.message);
    return null;
  }
}

async function runMigration() {
  try {
    console.log('\n🔄 Starting cover migration...\n');

    // Get all books without cover_id
    const query = `SELECT id, title, authors FROM books WHERE cover_id IS NULL AND is_active = true`;
    const result = await db.executeQuery(query, []);
    const books = result.rows;

    console.log(`📊 Found ${books.length} books without cover_id\n`);

    if (books.length === 0) {
      console.log('✅ All books already have cover_id!\n');
      process.exit(0);
    }

    let updated = 0;
    let failed = 0;

    // Process each book with delay to avoid rate limiting
    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      const coverId = await migrateCover(book);
      
      if (coverId) {
        updated++;
      } else {
        failed++;
      }

      // Rate limit: 500ms between requests
      if (i < books.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`\n✨ Migration complete!`);
    console.log(`✅ Updated: ${updated}`);
    console.log(`⚠️  Failed: ${failed}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
