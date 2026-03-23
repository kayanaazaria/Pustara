const express = require('express');
const { getAllBooks, getBookById } = require('../controllers/bookController');

function createBooksRoutes(verifyTokenMiddleware) {
  const router = express.Router();

  router.get('/', getAllBooks);
  router.get('/:id', verifyTokenMiddleware, getBookById);

  return router;
}

module.exports = createBooksRoutes;