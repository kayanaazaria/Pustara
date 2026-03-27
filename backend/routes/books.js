const express = require('express');
const { getAllBooks, getBookById } = require('../controllers/bookController');
const { applyProtectedRateLimits } = require('./protected');

function createBooksRoutes(verifyTokenMiddleware) {
  const router = express.Router();

  router.get('/', getAllBooks);
  router.get('/:id', getBookById);
  router.post('/:id/interact', verifyTokenMiddleware, applyProtectedRateLimits.activity, interactWithBook);
  return router;
}

module.exports = createBooksRoutes;