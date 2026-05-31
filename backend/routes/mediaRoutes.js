const express = require('express');
const mediaController = require('../controllers/mediaController');

const router = express.Router();

router.get('/proxy', mediaController.proxyMedia);

module.exports = router;