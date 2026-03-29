/**
 * Feed Routes
 * API endpoints for user feed (activity, notifications, recommendations)
 */

const express = require('express');
const {
  getMyFeedActivity,
  getMyNotifications,
  getMyRecommendations,
} = require('../controllers/feedController');

const router = express.Router();

/**
 * GET /feed/me/activity
 * Returns user's reading activity (current reads + finished reads)
 * Requires authentication
 */
router.get('/me/activity', getMyFeedActivity);

/**
 * GET /feed/me/notifications
 * Returns user's notifications
 * Requires authentication
 */
router.get('/me/notifications', getMyNotifications);

/**
 * GET /feed/me/recommendations
 * Returns personalized recommendations for feed sidebar
 * Requires authentication
 */
router.get('/me/recommendations', getMyRecommendations);

module.exports = router;
