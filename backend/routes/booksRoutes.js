// Books Routes dengan file handling
const express = require('express');
const router = express.Router();
const booksController = require('../controllers/booksController');

// PUBLIC ROUTES - Read only
router.get('/books', booksController.getBooks);
router.get('/books/search', booksController.searchBooks);
router.get('/books/:id', booksController.getBookDetail);
router.get('/books/:id/file', booksController.downloadBookFile);

// TODO: Admin routes (POST, PUT, DELETE) - akan di-implement setelah auth structure more stable
// router.post('/books', authenticateAdmin, booksController.createBook);
// router.put('/books/:id', authenticateAdmin, booksController.updateBook);
// router.delete('/books/:id', authenticateAdmin, booksController.deleteBook);

module.exports = router;
