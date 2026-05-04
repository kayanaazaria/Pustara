// Books Routes dengan file handling
const express = require('express');
const router = express.Router();
const booksController = require('../controllers/booksController');

// DEVELOPMENT: Upload form page (no auth) - COMMENTED: getUploadForm tidak ada di controller
// router.get('/upload-book', booksController.getUploadForm);

// PUBLIC ROUTES - Read only

// ⚠️  IMPORTANT: Place specific routes BEFORE parameterized routes!
// Reviews endpoint (public, can add auth later)
router.post('/reviews', (req, res, next) => {
  console.log('🔴 POST /reviews received');
  next();
}, booksController.createOrUpdateReview);

router.get('/genres', booksController.getGenres);
router.get('/books/trending', booksController.getTrendingBooks);
router.get('/books', booksController.getBooks);
router.get('/books/genres', booksController.getGenres);
router.get('/books/search', booksController.searchBooks);
router.get('/books/:id', booksController.getBookDetail);
router.get('/books/:id/debug', booksController.getBookDebug);  // DEBUG endpoint
router.get('/books/:id/file', booksController.downloadBookFile);
router.get('/books/:id/reviews', booksController.getBookReviews);

// DEVELOPMENT: Upload endpoint (no auth required)
// router.post('/books/upload-dev', booksController.uploadBookDev); // TODO: implement uploadBookDev

// Admin routes will be mounted separately with auth middleware in index.js
// router.post('/books', authorizeAdmin, booksController.createBook);
// router.put('/books/:id', authorizeAdmin, booksController.updateBook);
// router.delete('/books/:id', authorizeAdmin, booksController.deleteBook);

module.exports = router;
