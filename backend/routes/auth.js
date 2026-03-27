/**
 * Authentication Routes
 * Handles: signup, signin, verify-token, logout, profile
 */

const express = require("express");
const CONFIG = require("../constants/config");
const { createIPRateLimiter } = require("../middleware/rateLimit");
const { createCaptchaMiddleware } = require("../middleware/captcha");

/**
 * Async error handler wrapper
 * Catches errors and passes to error handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`Route error: ${err.message}`);
    res.status(500).json({ success: false, error: CONFIG.ERRORS.INTERNAL_SERVER_ERROR });
  });
};

/**
 * Create auth routes
 * @param {AuthService} authService - Service instance
 * @param {Function} verifyTokenMiddleware - Token verification middleware
 * @returns {Router} Express router
 */
function createAuthRoutes(authService, verifyTokenMiddleware) {
  const router = express.Router();
  const UserService = require("../services/userService");
  const authRateLimiter = createIPRateLimiter(
    CONFIG.RATE_LIMIT.AUTH.window,
    CONFIG.RATE_LIMIT.AUTH.max
  );
  const captchaMiddleware = createCaptchaMiddleware();

  // POST /auth/signup - Register new user
  router.post(
    "/signup",
    authRateLimiter,
    captchaMiddleware,
    asyncHandler(async (req, res) => {
      const result = await authService.signUp(req.body.email, req.body.password);
      res.status(result.status).json(result);
    })
  );

  // POST /auth/signin - Login user
  router.post(
    "/signin",
    authRateLimiter,
    captchaMiddleware,
    asyncHandler(async (req, res) => {
      const result = await authService.signIn(req.body.email, req.body.password);
      res.status(result.status).json(result);
    })
  );

  // POST /auth/verify-token - Verify token & auto-create user in Azure SQL
  router.post(
    "/verify-token",
    asyncHandler(async (req, res) => {
      const authResult = await authService.verifyToken(req.body.token);
      
      if (authResult.success) {
        const { uid, email, displayName } = authResult.user;
        
        // Auto-create user in Azure SQL jika belum ada
        const userExists = await UserService.getUserByUid(uid);
        if (!userExists.data) {
          console.log(`📝 First login detected for ${email}, syncing to Azure SQL...`);
          await UserService.createUser(uid, email, displayName);
          console.log(`✅ User synced successfully`);
        }
      }
      
      res.status(authResult.status).json(authResult);
    })
  );

  // GET /auth/me - Get current user (protected)
  router.get(
    "/me",
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const result = await authService.getUserProfile(req.user.uid);
      res.status(result.status).json(result);
    })
  );

  // POST /auth/logout - Logout (protected)
  router.post(
    "/logout",
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const result = await authService.logout(req.user.uid);
      res.status(result.status).json(result);
    })
  );

  return router;
}

module.exports = { createAuthRoutes };
