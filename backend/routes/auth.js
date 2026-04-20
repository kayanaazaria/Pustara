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
  return Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`[ROUTE ERROR] ${req.method} ${req.path}:`, {
      message: err.message,
      stack: err.stack
    });
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
  console.log('[AUTH ROUTES] createAuthRoutes function called');
  const router = express.Router();
  const UserService = require("../services/userService");
  const authRateLimiter = createIPRateLimiter(
    CONFIG.RATE_LIMIT.AUTH.window,
    CONFIG.RATE_LIMIT.AUTH.max
  );
  const captchaMiddleware = createCaptchaMiddleware();
  console.log('[AUTH ROUTES] Router created and middleware initialized');

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
    // authRateLimiter, // Temporarily disabled for debugging
    // captchaMiddleware, // Temporarily disabled for debugging
    asyncHandler(async (req, res) => {
      console.log('[AUTH/SIGNIN] ======= SIGNIN ROUTE CALLED =======');
      console.log('[AUTH/SIGNIN] Email:', req.body.email);
      const result = await authService.signIn(req.body.email, req.body.password);
      console.log('[AUTH/SIGNIN] Result:', { success: result.success, status: result.status });
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
      const uid = req.user.uid;
      console.log('[AUTH/ME] ======= /auth/me CALLED =======');
      console.log('[AUTH/ME] UID:', uid);
      
      // Get user from database (returns UUID id field)
      const userResult = await UserService.getUserByUid(uid);
      console.log('[AUTH/ME] getUserByUid result:', JSON.stringify(userResult, null, 2));
      
      if (userResult.success && userResult.data) {
        console.log('[AUTH/ME] User found in DB, returning:', userResult.data.id);
        // User exists in database
        return res.status(200).json({
          success: true,
          user: userResult.data
        });
      }
      
      console.log('[AUTH/ME] User not in DB, creating...');
      // User not in database, create it
      const firebaseUser = await authService.getUserProfile(uid);
      console.log('[AUTH/ME] Firebase user:', firebaseUser);
      
      if (firebaseUser.success) {
        const { email, displayName } = firebaseUser.user;
        console.log('[AUTH/ME] Creating user with email:', email);
        const createResult = await UserService.createUser(uid, email, displayName);
        console.log('[AUTH/ME] createUser result:', JSON.stringify(createResult, null, 2));
        
        if (createResult.success) {
          console.log('[AUTH/ME] User created, returning:', createResult.data.id);
          return res.status(200).json({
            success: true,
            user: createResult.data
          });
        }
      }
      
      console.log('[AUTH/ME] ERROR: Failed to get or create user');
      res.status(500).json({
        success: false,
        message: 'Failed to get or create user'
      });
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
