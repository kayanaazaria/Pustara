const express = require('express');
const mediaController = require('../controllers/mediaController');

const router = express.Router();

router.get('/proxy', mediaController.proxyMedia);
router.get('/avatar/:id', mediaController.avatarById);

module.exports = router;