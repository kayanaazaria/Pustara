// Books Controller dengan Azure Blob file handling
const db = require('../config/database');
const azureBlob = require('../providers/azureBlobProvider');
const { v4: uuidv4 } = require('uuid');
const { sendOpsAlert } = require('../services/opsAlertService');

function toRows(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result && Array.isArray(result.recordset)) return result.recordset;
  return [];
}

function parseGenresCell(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch (_) {
      // ignore JSON parsing errors and continue with delimiter parsing
    }

    if (raw.startsWith('{') && raw.endsWith('}')) {
      return raw
        .slice(1, -1)
        .split(',')
        .map((v) => v.replace(/^"|"$/g, '').trim())
        .filter(Boolean);
    }

    return raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [];
}

function sanitizePagination(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function withDownloadUrl(book, req) {
  if (!book || !book.file_url || !book.id) return book;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return {
    ...book,
    file_url: `${baseUrl}/books/${book.id}/file`,
  };
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

// GET /books/trending - Get trending books (populer berdasarkan jumlah review + rating)
exports.getTrendingBooks = async (req, res) => {
  const requestId = `[TRENDING-${Date.now()}]`;
  
  try {
    // 🔍 DEBUG: Verify this function is called
    console.log(`\n╔════════════════════════════════════════════════════════════╗`);
    console.log(`║ [EXEC] booksController.getTrendingBooks RUNNING            ║`);
    console.log(`║ Source: backend/controllers/booksController.js line 69     ║`);
    console.log(`║ Type: DATABASE QUERY ONLY (no fetch call)                  ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝`);
    console.log(`${requestId} Starting getTrendingBooks request`);
    console.log(`${requestId} Query params:`, req.query);

    const { limit = 10, offset = 0 } = req.query;
    const limitNum = sanitizePagination(limit, 10, 1, 50);
    const offsetNum = sanitizePagination(offset, 0, 0, 100000);

    console.log(`${requestId} Sanitized params - limit: ${limitNum}, offset: ${offsetNum}`);

    // Query trending books berdasarkan:
    // 1. Jumlah review (review_count) - popularity
    // 2. Rating rata-rata (avg_rating) - quality
    // 3. Waktu dibuat (created_at) - recency
    const query = `
      SELECT * FROM books 
      WHERE is_active = true
      ORDER BY 
        COALESCE(review_count, 0) DESC,
        COALESCE(avg_rating, 0) DESC,
        created_at DESC
      LIMIT $1 OFFSET $2
    `;

    console.log(`${requestId} Executing database query...`);
    const result = await db.executeQuery(query, [limitNum, offsetNum]);
    const rows = toRows(result);
    
    console.log(`${requestId} Query successful, fetched ${rows.length} books`);

    // Transform dengan download URLs
    const booksData = rows.map((book) => {
      try {
        return withDownloadUrl(book, req);
      } catch (mapErr) {
        console.error(`${requestId} Error transforming book ${book?.id}:`, mapErr.message);
        return book; // Return raw jika transform gagal
      }
    });

    console.log(`${requestId} Successfully transformed ${booksData.length} books`);

    res.json({
      success: true,
      data: booksData,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        count: booksData.length,
      },
      meta: {
        timestamp: new Date().toISOString(),
        source: 'database',
        sortBy: 'review_count, avg_rating, created_at',
      },
    });

  } catch (error) {
    console.error(`${requestId} ❌ Error in getTrendingBooks:`, {
      message: error.message,
      code: error.code,
      stack: error.stack?.split('\n')[0],
    });

    // Graceful fallback: return empty array dengan 500 status
    res.status(500).json({
      success: false,
      error: {
        type: 'DATABASE_ERROR',
        message: 'Unable to fetch trending books',
        detail: process.env.NODE_ENV === 'development' ? error.message : 'Service temporarily unavailable',
      },
      data: [],
      pagination: {
        limit: 10,
        offset: 0,
        count: 0,
      },
    });
  }
};

// GET /books - List all books dengan pagination & filters
exports.getBooks = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      genre,
      search,
      sort = 'created_at',
      order = 'DESC',
    } = req.query;
    const pageNum = sanitizePagination(page, 1, 1, 100000);
    const limitNum = sanitizePagination(limit, 10, 1, 100);
    const offset = (pageNum - 1) * limitNum;
    
    let query = 'SELECT * FROM books WHERE is_active = true';
    const params = [];

    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      query += ` AND (title ILIKE $${params.length + 1} OR authors::text ILIKE $${params.length + 1})`;
      params.push(term);
    }

    // Filter by genre jika ada
    if (genre) {
      query += ` AND $${params.length + 1} = ANY(genres)`;
      params.push(genre);
    }

    // Sort
    const validSort = ['created_at', 'avg_rating', 'title', 'year'];
    const validOrder = ['ASC', 'DESC'];
    const sortBy = validSort.includes(sort) ? sort : 'created_at';
    const orderBy = validOrder.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';
    
    query += ` ORDER BY ${sortBy} ${orderBy}`;
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offset);

    const result = await db.executeQuery(query, params);
    const rows = toRows(result);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM books WHERE is_active = true';
    const countParams = [];

    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      countQuery += ` AND (title ILIKE $${countParams.length + 1} OR authors::text ILIKE $${countParams.length + 1})`;
      countParams.push(term);
    }

    if (genre) {
      countQuery += ` AND $${countParams.length + 1} = ANY(genres)`;
      countParams.push(genre);
    }
    const countResult = await db.executeQuery(countQuery, countParams);
    const countRows = toRows(countResult);

    const totalItems = Number.parseInt(String(countRows[0]?.total || 0), 10) || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / limitNum));
    const booksData = rows.map((book) => withDownloadUrl(book, req));

    res.json({
      success: true,
      data: booksData,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalItems,
        pages: totalPages,
        total_items: totalItems,
        total_pages: totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching books:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /books/genres - Get unique genre list for browse category
exports.getGenres = async (_req, res) => {
  try {
    const result = await db.executeQuery(
      'SELECT genres FROM books WHERE is_active = true AND genres IS NOT NULL'
    );
    const rows = toRows(result);

    const unique = new Map();
    for (const row of rows) {
      const genres = parseGenresCell(row?.genres);
      for (const genre of genres) {
        const normalized = genre.trim();
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        if (!unique.has(key)) {
          unique.set(key, normalized);
        }
      }
    }

    const data = Array.from(unique.values()).sort((a, b) => a.localeCompare(b, 'id'));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching genres:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /books/search - Search books
exports.searchBooks = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Search query too short' });
    }

    const searchQuery = `%${q}%`;
    const query = `
      SELECT id, title, authors, genres, avg_rating, cover_url
      FROM books 
      WHERE is_active = true 
      AND (title ILIKE $1 OR authors::text ILIKE $1)
      LIMIT $2
    `;

    const result = await db.executeQuery(query, [searchQuery, limit]);
    const rows = toRows(result);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error searching books:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /books/:id - Get single book detail
exports.getBookDetail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isUuidLike(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid book id format',
        error: {
          code: 'INVALID_BOOK_ID',
          id,
        },
      });
    }

    const query = 'SELECT * FROM books WHERE id = $1 AND is_active = true';
    const result = await db.executeQuery(query, [id]);
    const rows = toRows(result);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
        error: {
          code: 'BOOK_NOT_FOUND',
          id,
        },
      });
    }

    const book = withDownloadUrl(rows[0], req);

    res.json({
      success: true,
      data: book
    });
  } catch (error) {
    console.error('Error fetching book detail:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /books/:id/similar - MVP similar books by genre/author
exports.getSimilarBooks = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isUuidLike(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid book id format',
        error: { code: 'INVALID_BOOK_ID', id },
      });
    }

    const seedResult = await db.executeQuery(
      'SELECT id, authors, genres FROM books WHERE id = $1 AND is_active = true',
      [id]
    );
    const seedRows = toRows(seedResult);

    if (seedRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
        error: { code: 'BOOK_NOT_FOUND', id },
      });
    }

    const seed = seedRows[0];
    const genres = parseGenresCell(seed.genres);
    const authors = parseGenresCell(seed.authors);

    const conditions = [];
    const params = [id];

    for (const genre of genres.slice(0, 4)) {
      conditions.push(`$${params.length + 1} = ANY(genres)`);
      params.push(genre);
    }

    for (const author of authors.slice(0, 2)) {
      conditions.push(`authors::text ILIKE $${params.length + 1}`);
      params.push(`%${author}%`);
    }

    const whereSimilar = conditions.length > 0 ? `AND (${conditions.join(' OR ')})` : '';
    const similarQuery = `
      SELECT *
      FROM books
      WHERE is_active = true
        AND id <> $1
        ${whereSimilar}
      ORDER BY avg_rating DESC, created_at DESC
      LIMIT 5
    `;

    const similarResult = await db.executeQuery(similarQuery, params);
    const similarRows = toRows(similarResult).map((book) => withDownloadUrl(book, req));

    res.json({
      success: true,
      data: similarRows,
      meta: {
        source_book_id: id,
        total: similarRows.length,
      },
    });
  } catch (error) {
    console.error('Error fetching similar books:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /books/:id/reviews - Get book reviews
exports.getBookReviews = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    const limitNum = sanitizePagination(limit, 100, 1, 500);
    const offsetNum = sanitizePagination(offset, 0, 0, 100000);

    if (!isUuidLike(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid book id format',
        error: { code: 'INVALID_BOOK_ID', id },
      });
    }

    // Verify book exists
    const bookCheck = await db.executeQuery(
      'SELECT id FROM books WHERE id = $1 AND is_active = true',
      [id]
    );
    const bookRows = toRows(bookCheck);
    if (bookRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
        error: { code: 'BOOK_NOT_FOUND', id },
      });
    }

    // Fetch reviews with user info
    const query = `
      SELECT 
        r.id,
        r.rating,
        r.review_text as text,
        r.created_at as time,
        u.display_name as name,
        COALESCE(u.display_name, 'U') as avatar
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.book_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.executeQuery(query, [id, limitNum, offsetNum]);
    const reviews = toRows(result);

    // Get total count
    const countResult = await db.executeQuery(
      'SELECT COUNT(*) as total FROM reviews WHERE book_id = $1',
      [id]
    );
    const countRows = toRows(countResult);
    const totalReviews = Number.parseInt(String(countRows[0]?.total || 0), 10) || 0;

    res.json({
      success: true,
      data: reviews,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: totalReviews,
      },
    });
  } catch (error) {
    console.error('Error fetching book reviews:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /books/:id/file - Download book file
exports.downloadBookFile = async (req, res) => {
  try {
    const { id } = req.params;

    // Get book from database
    const query = 'SELECT id, title, file_url, file_type FROM books WHERE id = $1';
    const result = await db.executeQuery(query, [id]);
    const rows = toRows(result);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const book = rows[0];

    if (!book.file_url) {
      return res.status(404).json({ success: false, message: 'Book file not available' });
    }

    // Extract filename from URL
    const fileName = book.file_url.split('/').pop();

    // Stream file from Azure Blob
    const stream = await azureBlob.downloadFile(fileName);
    
    res.setHeader('Content-Type', book.file_type || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${book.title}.pdf"`);
    
    stream.pipe(res);
  } catch (error) {
    console.error('Error downloading book file:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /books - Admin: Create new book (dengan file upload)
exports.createBook = async (req, res) => {
  try {
    const { title, description, year, pages, language } = req.body;
    let { authors, genres } = req.body;
    const file = req.files?.bookFile;

    // Validation
    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    // Parse authors - accept string or array
    if (typeof authors === 'string') {
      authors = authors.split(',').map(a => a.trim()).filter(a => a);
    }
    if (!Array.isArray(authors) || authors.length === 0) {
      return res.status(400).json({ success: false, message: 'Authors is required (comma-separated or array)' });
    }

    // Parse genres - accept string or array
    if (typeof genres === 'string') {
      genres = genres.split(',').map(g => g.trim()).filter(g => g);
    }
    if (!Array.isArray(genres) || genres.length === 0) {
      return res.status(400).json({ success: false, message: 'Genres is required (comma-separated or array)' });
    }

    let fileUrl = null;
    let fileSize = null;
    let fileType = 'application/pdf';

    // Upload file to Azure Blob jika ada
    if (file) {
      if (!['application/pdf', 'application/x-pdf'].includes(file.mimetype)) {
        return res.status(400).json({ success: false, message: 'Only PDF files are allowed' });
      }

      fileType = file.mimetype;
      const fileName = `${uuidv4()}-${Date.now()}.pdf`;
      
      try {
        fileUrl = await azureBlob.uploadFile(fileName, file.data, fileType);
        fileSize = file.size;
      } catch (uploadError) {
        console.error('Azure upload error:', uploadError.message);
        return res.status(500).json({ success: false, message: 'Failed to upload file to storage' });
      }
    }

    const pool = require('../config/database').getPool();
    const query = `
      INSERT INTO books (title, authors, genres, description, "year", pages, language, file_url, file_size, file_type, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      RETURNING *
    `;

    const result = await pool.query(query, [
      title,
      authors,
      genres,
      description || null,
      year ? parseInt(year) : null,
      pages ? parseInt(pages) : null,
      language || 'id',
      fileUrl,
      fileSize,
      fileType
    ]);

    res.status(201).json({
      success: true,
      message: 'Book created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating book:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /books/:id - Admin: Update book
exports.updateBook = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, authors, genres, description, year, pages, is_active } = req.body;

    const query = `
      UPDATE books 
      SET title = COALESCE($1, title),
          authors = COALESCE($2, authors),
          genres = COALESCE($3, genres),
          description = COALESCE($4, description),
          "year" = COALESCE($5, "year"),
          pages = COALESCE($6, pages),
          is_active = COALESCE($7, is_active),
          updated_at = now()
      WHERE id = $8
      RETURNING *
    `;

    const result = await db.executeQuery(query, [
      title, authors, genres, description, year, pages, is_active, id
    ]);

    const rows = toRows(result);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    res.json({
      success: true,
      message: 'Book updated successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Error updating book:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /books/:id - Admin: Soft delete book
exports.deleteBook = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      UPDATE books 
      SET is_active = false, updated_at = now()
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.executeQuery(query, [id]);
    const rows = toRows(result);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    try {
      const deleted = rows[0] || {};
      const actor = req.user?.uid || req.user?.email || 'unknown';
      await sendOpsAlert('Pustara Soft Delete Book', [
        `Actor: ${actor}`,
        `Book ID: ${deleted.id || id}`,
        `Title: ${deleted.title || '-'}`,
        `is_active set to false`,
      ]);
    } catch (alertError) {
      console.warn('Delete alert email failed:', alertError.message);
    }

    res.json({
      success: true,
      message: 'Book deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting book:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /reviews - Create or update a review
exports.createOrUpdateReview = async (req, res) => {
  try {
    const { book_id, rating, review_text } = req.body;
    const user_id = req.user?.uid; // From Firebase token

    // Validation
    if (!book_id) {
      return res.status(400).json({ success: false, message: 'book_id is required' });
    }
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'rating must be 1-5' });
    }
    if (!review_text || typeof review_text !== 'string' || review_text.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'review_text is required' });
    }
    if (!user_id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Check if review exists
    const checkQuery = 'SELECT id FROM reviews WHERE book_id = $1 AND user_id = $2';
    const checkResult = await db.executeQuery(checkQuery, [book_id, user_id]);
    const existingRows = toRows(checkResult);

    let query, values, reviewId;

    if (existingRows.length > 0) {
      // UPDATE existing review
      reviewId = existingRows[0].id;
      query = `
        UPDATE reviews 
        SET rating = $1, review_text = $2, updated_at = NOW()
        WHERE id = $3 AND user_id = $4
        RETURNING id, rating, review_text, created_at, updated_at
      `;
      values = [rating, review_text, reviewId, user_id];
    } else {
      // INSERT new review
      query = `
        INSERT INTO reviews (user_id, book_id, rating, review_text)
        VALUES ($1, $2, $3, $4)
        RETURNING id, rating, review_text, created_at, updated_at
      `;
      values = [user_id, book_id, rating, review_text];
    }

    const result = await db.executeQuery(query, values);
    const rows = toRows(result);

    if (rows.length === 0) {
      return res.status(500).json({ success: false, message: 'Failed to save review' });
    }

    const review = rows[0];
    res.json({
      success: true,
      data: {
        id: review.id,
        book_id,
        user_id,
        rating: review.rating,
        review_text: review.review_text,
        created_at: review.created_at,
        updated_at: review.updated_at,
      }
    });
  } catch (error) {
    console.error('Error creating/updating review:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
