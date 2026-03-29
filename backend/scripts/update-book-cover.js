/**
 * Update book cover from OpenLibrary using ISBN
 * Usage: node update-book-cover.js <book-title> <isbn>
 * Example: node update-book-cover.js "Thomas' Calculus" "978-0-321-88407-7"
 */

require('dotenv').config();
const sql = require('mssql');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('❌ Usage: node update-book-cover.js "<book-title>" "<isbn>"');
  console.error('Example: node update-book-cover.js "Thomas Calculus" "978-0-321-88407-7"');
  process.exit(1);
}

const bookTitle = args[0];
const isbn = args[1];

// Generate OpenLibrary cover URL from ISBN
const isbnClean = isbn.replace(/-/g, '');
const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbnClean}-L.jpg`;

console.log(`\n📚 Updating Book Cover`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Title: ${bookTitle}`);
console.log(`ISBN: ${isbn}`);
console.log(`Cover URL: ${coverUrl}\n`);

const dbConfig = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    },
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30000,
    requestTimeout: 30000,
  },
};

async function updateCover() {
  const pool = new sql.ConnectionPool(dbConfig);

  try {
    await pool.connect();
    console.log('✓ Connected to Azure SQL');

    // Update book cover
    const request = pool.request();
    request.input('title', sql.NVarChar, bookTitle);
    request.input('coverUrl', sql.NVarChar, coverUrl);

    const result = await request.query(`
      UPDATE books 
      SET cover_url = @coverUrl, updated_at = GETDATE()
      WHERE title = @title OR title LIKE '%' + @title + '%'
    `);

    if (result.rowsAffected[0] > 0) {
      console.log(`\n✅ Cover updated successfully!`);
      console.log(`\n📍 New cover URL: ${coverUrl}`);
      console.log(`\nRefresh your browser to see the cover!`);
    } else {
      console.error(`\n❌ Book not found: ${bookTitle}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

updateCover();
