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
const CONFIG = require("./constants/config");
const FirebaseProvider = require("./providers/firebaseProvider");
const AuthService = require("./services/authService");
const { createVerifyTokenMiddleware } = require("./middleware/auth");
const { createAuthRoutes } = require("./routes/auth");
const createSurveyRoutes = require("./routes/survey");
const { initializeDatabase, createUsersTable, createUserSurveyTable } = require("./config/database");

// ==========================================
// INITIALIZE
// ==========================================
const app = express();

// CORS setup
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware
app.use(express.json());

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

// Survey Routes
app.use("/survey", createSurveyRoutes(verifyTokenMiddleware));

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
async function startServer() {
  try {
    // Initialize database
    console.log("Initializing Azure SQL Database...");
    await initializeDatabase();
    await createUsersTable();
    await createUserSurveyTable();
    
    app.listen(CONFIG.PORT, () => {
      console.log(`${CONFIG.MESSAGES.SERVER_RUNNING} ${CONFIG.PORT}`);
      console.log(`Environment: ${CONFIG.NODE_ENV}`);
      console.log(`Auth: Firebase`);
      console.log(`📊 Database: Azure SQL`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();