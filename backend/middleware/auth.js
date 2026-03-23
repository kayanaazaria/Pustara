/**
 * Authentication Middleware
 *
 * Verifies Firebase ID tokens from Authorization header
 * Format: "Authorization: Bearer <token>"
 */

const CONFIG = require("../constants/config");

/**
 * Creates token verification middleware
 * @param {AuthService} authService - Service instance for token verification
 * @returns {Function} Express middleware
 */
const createVerifyTokenMiddleware = (authService) => {
  return async (req, res, next) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(" ")[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          error: CONFIG.ERRORS.NO_TOKEN,
        });
      }

      // Verify token
      const result = await authService.verifyToken(token);

      if (!result.success) {
        return res.status(result.status || 401).json({
          success: false,
          error: result.error,
        });
      }

      // Attach user to request
      req.user = result.user;
      next();
    } catch (error) {
      console.error("Middleware error:", error.message);
      res.status(500).json({
        success: false,
        error: CONFIG.ERRORS.INTERNAL_SERVER_ERROR,
      });
    }
  };
};

/**
 * Optional token verification middleware for routes that allow both authenticated and unauthenticated users.
 * valid token -> req.user (for redis tracking).
 * no token -> req.user empty, but still allow access (guest).
 */
const createOptionalVerifyTokenMiddleware = (authService) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(" ")[1];

      if (!token) return next();

      // if token exists, try to verify.
      const result = await authService.verifyToken(token);
      if (result.success) {
        req.user = result.user;
      }
      next();
    } catch (error) {
      next(); 
    }
  };
};

module.exports = { 
  createVerifyTokenMiddleware,
  createOptionalVerifyTokenMiddleware
};
