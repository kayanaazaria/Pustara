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
console.log("🔥 DEBUG URL:", process.env.FASTAPI_URL);

const express = require("express");
const cors = require("cors");
const CONFIG = require("./constants/config");
const FirebaseProvider = require("./providers/firebaseProvider");
const AuthService = require("./services/authService");
const { createVerifyTokenMiddleware, createOptionalVerifyTokenMiddleware } = require("./middleware/auth");
const { createAuthRoutes } = require("./routes/auth");
const createSurveyRoutes = require("./routes/survey");
const { initializeDatabase, createUsersTable, createUserSurveyTable } = require("./config/database");
const { getAllBooks, getBookById, interactWithBook } = require('./controllers/bookController');

// Routes
const createRecommendationsRoutes = require('./routes/recommendations');

require('./jobs/cron'); //init cron jobs for ai-related tasks

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
app.use(cors({
  origin: CONFIG.CORS_ORIGINS || "http://localhost:3001",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Setup Auth
const authProvider = new FirebaseProvider();
const authService = new AuthService(authProvider);
const verifyTokenMiddleware = createVerifyTokenMiddleware(authService);
const optionalVerifyTokenMiddleware = createOptionalVerifyTokenMiddleware(authService);

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

// Recommendations Routes
app.use('/recommendations', createRecommendationsRoutes(verifyTokenMiddleware, optionalVerifyTokenMiddleware));

// Books Routes
app.get('/books', getAllBooks);
app.get('/books/:id', optionalVerifyTokenMiddleware, getBookById);
app.post('/books/:id/interact', verifyTokenMiddleware, interactWithBook);

// Cron Routes
app.use('/cron', require('./routes/cronRoutes'));

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
    console.log("Initializing Azure SQL Database...");
    await initializeDatabase();
    await createUsersTable();
    await createUserSurveyTable();
    
    app.listen(CONFIG.PORT, async () => {
      console.log(`${CONFIG.MESSAGES.SERVER_RUNNING} ${CONFIG.PORT}`);
      console.log(`Environment: ${CONFIG.NODE_ENV}`);
      console.log(`Auth: Firebase`);
      console.log(`📊 Database: Azure SQL`);

      console.log("developing PustarAI (Auto-Reindex)...");
      try {
        const aiUrl = process.env.FASTAPI_URL || 'http://localhost:8001';
        const cronSecret = process.env.CRON_SECRET || 'pustara-cron-2025';
        
        const res = await fetch(`${aiUrl}/reindex?key=${cronSecret}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.HF_TOKEN}`
          }
        });
        
        if (res.ok) {
          console.log("✅ PustarAI successfully reindexed and is ready to use!");
        } else {
          console.log(`⚠️ PustarAI failed to reindex. Status: ${res.status}`);
        }
      } catch (err) {
        console.error("❌ Failed to contact HF", err.message);
      }
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();