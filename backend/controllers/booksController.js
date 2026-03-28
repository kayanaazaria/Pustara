// Books Controller dengan Azure Blob file handling
const db = require('../config/database');
const azureBlob = require('../providers/azureBlobProvider');
const { v4: uuidv4 } = require('uuid');
const { sendOpsAlert } = require('../services/opsAlertService');

// GET /books - List all books dengan pagination & filters
exports.getBooks = async (req, res) => {
  try {
    const { page = 1, limit = 10, genre, sort = 'created_at', order = 'DESC' } = req.query;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM books WHERE is_active = true';
    const params = [];

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
    params.push(limit, offset);

    const result = await db.executeQuery(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM books WHERE is_active = true';
    const countParams = [];
    if (genre) {
      countQuery += ` AND $1 = ANY(genres)`;
      countParams.push(genre);
    }
    const countResult = await db.executeQuery(countQuery, countParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching books:', error.message);
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

    res.json({
      success: true,
      data: result.rows
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

    const query = 'SELECT * FROM books WHERE id = $1 AND is_active = true';
    const result = await db.executeQuery(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching book detail:', error.message);
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

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const book = result.rows[0];

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

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    res.json({
      success: true,
      message: 'Book updated successfully',
      data: result.rows[0]
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

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    try {
      const deleted = result.rows[0] || {};
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
