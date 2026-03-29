/**
 * Upload custom book PDF to Azure Blob
 * Usage: node upload-custom-book.js <pdf-path>
 * Example: node upload-custom-book.js "D:\path\to\book.pdf"
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const azureBlob = require('../providers/azureBlobProvider');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('❌ Usage: node upload-custom-book.js "<pdf-path>"');
  console.error('Example: node upload-custom-book.js "D:\\Downloads\\MyBook.pdf"');
  process.exit(1);
}

const pdfPath = args[0];

// Check if file exists
if (!fs.existsSync(pdfPath)) {
  console.error(`❌ File not found: ${pdfPath}`);
  process.exit(1);
}

// Validate it's a PDF
if (!pdfPath.toLowerCase().endsWith('.pdf')) {
  console.error('❌ File must be a PDF (.pdf)');
  process.exit(1);
}

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

async function uploadBook() {
  const pool = new sql.ConnectionPool(dbConfig);

  try {
    await pool.connect();
    console.log('✓ Connected to Azure SQL\n');

    // Read PDF file
    const fileBuffer = fs.readFileSync(pdfPath);
    const fileName = `${uuidv4()}.pdf`;
    const fileSize = fileBuffer.length;

    console.log(`📄 File: ${path.basename(pdfPath)}`);
    console.log(`📊 Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n`);

    // Upload to Azure Blob
    console.log('⏳ Uploading to Azure Blob Storage...');
    const fileUrl = await azureBlob.uploadFile(fileName, fileBuffer, 'application/pdf');
    console.log(`✅ Uploaded to Blob!\n`);

    // Get book details from user
    console.log('📝 Now let\'s add book details to database:\n');

    const bookId = uuidv4();

    // For demo, collect via environment or defaults
    const bookTitle = process.env.BOOK_TITLE || path.basename(pdfPath, '.pdf');
    const bookAuthor = process.env.BOOK_AUTHOR || 'Unknown Author';
    const bookGenres = (process.env.BOOK_GENRES || 'Educational,Mathematics').split(',');
    const bookYear = parseInt(process.env.BOOK_YEAR || new Date().getFullYear());
    const bookPages = process.env.BOOK_PAGES || '0';
    const bookDescription = process.env.BOOK_DESC || `Custom uploaded book: ${bookTitle}`;
    const bookRating = parseFloat(process.env.BOOK_RATING || '4.5');

    console.log(`Title: ${bookTitle}`);
    console.log(`Author: ${bookAuthor}`);
    console.log(`Genres: ${bookGenres.join(', ')}`);
    console.log(`Year: ${bookYear}`);
    console.log(`Pages: ${bookPages}`);
    console.log(`Rating: ${bookRating}\n`);

    // Insert to database
    console.log('⏳ Inserting to Azure SQL...');
    const request = pool.request();
    request.input('id', sql.UniqueIdentifier, bookId);
    request.input('title', sql.NVarChar(500), bookTitle);
    request.input('authors', sql.NVarChar(sql.MAX), JSON.stringify([bookAuthor]));
    request.input('genres', sql.NVarChar(sql.MAX), JSON.stringify(bookGenres));
    request.input('description', sql.NVarChar(2000), bookDescription);
    request.input('year', sql.Int, bookYear);
    request.input('pages', sql.Int, parseInt(bookPages));
    request.input('language', sql.NVarChar(50), 'en');
    request.input('avg_rating', sql.Numeric(3, 2), bookRating);
    request.input('rating_count', sql.Int, 1);
    request.input('file_url', sql.NVarChar(sql.MAX), fileUrl);
    request.input('file_type', sql.NVarChar(50), 'application/pdf');

    await request.query(`
      INSERT INTO books (
        id, title, authors, genres, description, 
        year, pages, language, avg_rating, rating_count,
        file_url, file_type, total_stock, available, is_active, created_at, updated_at
      ) VALUES (
        @id, @title, @authors, @genres, @description,
        @year, @pages, @language, @avg_rating, @rating_count,
        @file_url, @file_type, 5, 5, 1, GETDATE(), GETDATE()
      )
    `);

    console.log(`✅ Book inserted to database!\n`);

    console.log('✨ SUCCESS! Book is now available in Pustara');
    console.log(`\n📍 Blob URL: ${fileUrl}`);
    console.log(`📍 Book ID: ${bookId}`);
    console.log(`\nYou can now:`);
    console.log(`  1. Visit http://localhost:3001 (frontend)`);
    console.log(`  2. Go to /catalog page`);
    console.log(`  3. See your book "${bookTitle}" in the list`);
    console.log(`  4. Click to view details or download PDF`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

uploadBook();
