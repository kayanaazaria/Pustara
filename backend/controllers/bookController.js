const { executeQuery } = require('../config/database'); 
const { logBookInteraction } = require('../services/redis');

const getAllBooks = async (req, res) => {
  try {
    const books = await executeQuery('SELECT * FROM books ORDER BY title');
    res.status(200).json({ success: true, data: books });
  } catch (error) {
    console.error('❌ Error fetching books:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil data katalog buku' });
  }
};

// fetch book details by ID, and at the same time track 'view' interaction to Redis
const getBookById = async (req, res) => {
  try {
    const { id } = req.params;
    const books = await executeQuery('SELECT * FROM books WHERE id = $1', [id]);
    
    if (books.length === 0) {
      return res.status(404).json({ success: false, message: 'Buku tidak ditemukan' });
    }

    const book = books[0];

    // track 'view' interaction to redis (if authenticated)
    if (req.user && req.user.uid) {
      try {
        // push view activity to Redis, but make sure Redis errors do not interfere with the main response
        await logBookInteraction(req.user.uid, id, 'view');
        console.log(`✅ Tracking view successful: User ${req.user.uid} viewed book ${id}`);
      } catch (redisError) {
        console.error('⚠️ Redis tracking failed, but it keeps running:', redisError.message);
      }
    }

    res.status(200).json({ success: true, data: book });
  } catch (error) {
    console.error('❌ Error fetching book details:', error);
    res.status(500).json({ success: false, message: 'Error fetching book details' });
  }
};

module.exports = {
  getAllBooks,
  getBookById
};