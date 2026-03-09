/**
 * Application Configuration Constants
 */

const CONFIG = {
  // Server
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",

  // Firebase
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,

  // Auth
  TOKEN_BEARER_PREFIX: "Bearer",
  MIN_PASSWORD_LENGTH: 6,

  // Messages
  MESSAGES: {
    SERVER_RUNNING: "✅ Server running on port",
    FIREBASE_INITIALIZED: "🔐 Firebase Admin SDK initialized",
    TOKEN_VERIFIED: "✅ Token verified successfully",
    USER_CREATED: "User created successfully",
    LOGIN_SUCCESS: "Login successful",
    LOGOUT_SUCCESS: "Logged out successfully",
  },

  // Errors
  ERRORS: {
    NO_TOKEN: "No token provided in Authorization header",
    INVALID_TOKEN_FORMAT: "Invalid token format",
    TOKEN_VERIFICATION_FAILED: "Token verification failed",
    EMAIL_PASSWORD_REQUIRED: "Email and password are required",
    PASSWORD_TOO_SHORT: `Password must be at least ${6} characters`,
    INTERNAL_SERVER_ERROR: "Internal server error",
  },
};

module.exports = CONFIG;
