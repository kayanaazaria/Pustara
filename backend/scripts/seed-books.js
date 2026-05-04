/**
 * Seed popular Indonesian books to database
 * These books will be used for testing and demonstration
 * 
 * Usage: node seed-books.js
 * 
 * Note: This uses OpenLibrary API for cover IDs
 */

require('dotenv').config();
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Popular Indonesian books with OpenLibrary data
const BOOKS_TO_SEED = [
  {
    title: 'Laskar Pelangi',
    authors: ['Andrea Hirata'],
    genres: ['Fiction', 'Indonesia', 'Coming of Age'],
    description: 'A novel about friendship and dreams set in a poor school on Belitong island.',
    year: 2005,
    pages: 529,
    cover_id: 3247154, // OpenLibrary cover ID
    avg_rating: 4.2,
    rating_count: 500
  },
  {
    title: 'Bumi Manusia',
    authors: ['Pramoedya Ananta Toer'],
    genres: ['Fiction', 'Indonesia', 'Historical'],
    description: 'The first book of Quartet novels, telling the story of Javanese youth in colonial Indonesia.',
    year: 1980,
    pages: 545,
    cover_id: 6206886,
    avg_rating: 4.1,
    rating_count: 350
  },
  {
    title: 'Cantik Itu Luka',
    authors: ['Eka Kurniawan'],
    genres: ['Fiction', 'Indonesia', 'Historical'],
    description: 'A haunting tale of a woman marked by violence in the aftermath of 1965 Indonesian purge.',
    year: 2002,
    pages: 350,
    cover_id: 7382962,
    avg_rating: 4.0,
    rating_count: 280
  },
  {
    title: 'Perahu Kertas',
    authors: ['Dee Lestari'],
    genres: ['Fiction', 'Indonesia', 'Romance', 'Adventure'],
    description: 'An epic romance spanning across continents, following two souls destined to meet.',
    year: 2009,
    pages: 432,
    cover_id: 8295847,
    avg_rating: 4.3,
    rating_count: 420
  },
  {
    title: 'Negeri 5 Menara',
    authors: ['Ahmad Fuadi'],
    genres: ['Fiction', 'Indonesia', 'Adventure', 'Educational'],
    description: 'A story of five Indonesian teenagers pursuing their dreams at a boarding school in Africa.',
    year: 2009,
    pages: 495,
    cover_id: 9174256,
    avg_rating: 4.4,
    rating_count: 380
  },
  {
    title: 'Pasung Semilir',
    authors: ['Hermawan Aksan'],
    genres: ['Fiction', 'Indonesia', 'Drama'],
    description: 'A poignant story about struggle and human resilience in challenging circumstances.',
    year: 2008,
    pages: 275,
    cover_id: 7856432,
    avg_rating: 3.9,
    rating_count: 200
  },
  {
    title: 'Maryamah Karpov',
    authors: ['Andrea Hirata'],
    genres: ['Fiction', 'Indonesia', 'Historical', 'Adventure'],
    description: 'An adventure story connected to chess, set in Russia and Indonesia.',
    year: 2011,
    pages: 450,
    cover_id: 10456789,
    avg_rating: 4.1,
    rating_count: 310
  },
  {
    title: 'Remaja Putri Muslim',
    authors: ['Cahyadi'],
    genres: ['Non-Fiction', 'Indonesia', 'Education', 'Self-Help'],
    description: 'A guide for Muslim girls navigating teenage years with Islamic values.',
    year: 2005,
    pages: 280,
    cover_id: 5847293,
    avg_rating: 3.8,
    rating_count: 150
  },
  {
    title: 'Jejak Langkah',
    authors: ['Habiburrahman El Shirazy'],
    genres: ['Fiction', 'Indonesia', 'Religious', 'Drama'],
    description: 'A compelling story about spiritual journey and personal growth.',
    year: 2007,
    pages: 365,
    cover_id: 7294856,
    avg_rating: 4.2,
    rating_count: 290
  },
  {
    title: 'Si Anak Stamar',
    authors: ['Ahmad Fuadi'],
    genres: ['Fiction', 'Indonesia', 'Adventure', 'Educational'],
    description: 'A story about a young man\'s journey discovering his potential and destiny.',
    year: 2010,
    pages: 380,
    cover_id: 9384756,
    avg_rating: 4.0,
    rating_count: 220
  }
];

async function seedBooks() {
  try {
    console.log('\n🌱 Starting book seeding...\n');

    // Initialize database connection
    await db.initializeDatabase();

    // Check if books already exist
    const countResult = await db.executeQuery('SELECT COUNT(*) as count FROM books');
    const existingCount = countResult.rows[0]?.count || 0;

    if (existingCount > 0) {
      console.log(`⚠️  Database already has ${existingCount} books. Skipping seed to avoid duplicates.`);
      console.log('If you want to re-seed, run: DELETE FROM books;\n');
      process.exit(0);
    }

    // Insert books
    let insertedCount = 0;
    for (const book of BOOKS_TO_SEED) {
      const bookId = uuidv4();
      
      const query = `
        INSERT INTO books (
          id, 
          title, 
          authors, 
          genres, 
          description, 
          year, 
          pages, 
          cover_id,
          avg_rating, 
          rating_count,
          language,
          is_active,
          created_at,
          updated_at
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      `;

      try {
        await db.executeQuery(query, [
          bookId,
          book.title,
          JSON.stringify(book.authors),
          JSON.stringify(book.genres),
          book.description,
          book.year,
          book.pages,
          book.cover_id,
          book.avg_rating,
          book.rating_count,
          'id', // language
          true   // is_active
        ]);

        console.log(`✅ ${book.title} by ${book.authors.join(', ')}`);
        insertedCount++;
      } catch (error) {
        console.error(`❌ Failed to insert "${book.title}":`, error.message);
      }
    }

    console.log(`\n✨ Seeded ${insertedCount}/${BOOKS_TO_SEED.length} books successfully!\n`);

    // Show sample queries
    console.log('📊 Sample queries you can try:\n');
    console.log('  GET /books');
    console.log('  GET /books/trending?limit=6');
    console.log('  GET /books/search?q=laskar');
    console.log('  GET /books?genre=Fiction\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedBooks();
