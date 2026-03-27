/**
 * Protected Routes Configuration
 * 
 * This middleware setup applies strict, user-based rate limiting to routes that:
 * 1. Require authentication (token verification)
 * 2. Should be rate-limited per user (not per IP)
 * 
 * Usage in index.js:
 * 
 * const { applyProtectedRateLimits } = require('./routes/protected');
 * 
 * // Apply to sensitive endpoints before handlers
 * app.post('/api/ai/chat', verifyTokenMiddleware, 
 *   applyProtectedRateLimits.aiChat, 
 *   chatHandler);
 * 
 * app.post('/books/:id/interact', verifyTokenMiddleware,
 *   applyProtectedRateLimits.activity,
 *   interactHandler);
 */

const { createUserRateLimiter } = require("../middleware/rateLimit");
const CONFIG = require("../constants/config");

const applyProtectedRateLimits = {
  // Strict rate limiting for AI chat endpoints (prevent token abuse)
  aiChat: createUserRateLimiter(
    CONFIG.RATE_LIMIT.AI_CHAT.window,
    CONFIG.RATE_LIMIT.AI_CHAT.max
  ),

  // Rate limiting for activity endpoints (like/bookmark/read)
  activity: createUserRateLimiter(
    CONFIG.RATE_LIMIT.ACTIVITY.window,
    CONFIG.RATE_LIMIT.ACTIVITY.max
  ),

  // Rate limiting for book metadata/fetch operations
  bookFetch: createUserRateLimiter(
    CONFIG.RATE_LIMIT.BOOK_FETCH.window,
    CONFIG.RATE_LIMIT.BOOK_FETCH.max
  ),
};

module.exports = { applyProtectedRateLimits };
