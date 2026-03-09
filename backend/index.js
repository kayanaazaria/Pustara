/**
 * Pustara Backend Server
 *
 * Express.js server dengan Firebase Authentication
 *
 * Architecture:
 * - config/     : Firebase initialization
 * - providers/  : Auth provider abstraction (Firebase, Azure, etc)
 * - services/   : Business logic layer
 * - middleware/ : Express middleware
 * - routes/     : API routes
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const CONFIG = require("./constants/config");
const FirebaseProvider = require("./providers/firebaseProvider");
const AuthService = require("./services/authService");
const { createVerifyTokenMiddleware } = require("./middleware/auth");
const { createAuthRoutes } = require("./routes/auth");

// ==========================================
// INITIALIZE
// ==========================================
const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: CONFIG.CORS_ORIGIN || "http://localhost:3001",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Setup Auth
const authProvider = new FirebaseProvider();
const authService = new AuthService(authProvider);
const verifyTokenMiddleware = createVerifyTokenMiddleware(authService);

// ==========================================
// ROUTES
// ==========================================

// Health Check
app.get("/", (req, res) => {
  res.json({ message: "Pustara API ready", status: "healthy" });
});

// Auth Routes
app.use("/auth", createAuthRoutes(authService, verifyTokenMiddleware));

// Protected Route Example
app.get("/api/protected", verifyTokenMiddleware, (req, res) => {
  res.json({ message: "Protected data", user: req.user });
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(500).json({ success: false, error: CONFIG.ERRORS.INTERNAL_SERVER_ERROR });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(CONFIG.PORT, () => {
  console.log(`${CONFIG.MESSAGES.SERVER_RUNNING} ${CONFIG.PORT}`);
  console.log(`Environment: ${CONFIG.NODE_ENV}`);
  console.log(`Auth: Firebase`);
});