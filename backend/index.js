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

const isDummyMode = process.env.NODE_ENV === 'dummy';
const dbType = isDummyMode ? 'Neon PostgreSQL' : 'Azure SQL';
const aiUrl = process.env.FASTAPI_URL || 'http://localhost:8001';

console.log("🔥 DEBUG URL:", aiUrl);
console.log(`📊 Database Mode: ${isDummyMode ? 'DUMMY (Neon PG)' : 'PRODUCTION (Azure SQL)'}`);
console.log(`🔐 NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);

const express = require("express");
const cors = require("cors");
const CONFIG = require("./constants/config");
const FirebaseProvider = require("./providers/firebaseProvider");
const AuthService = require("./services/authService");
const { createVerifyTokenMiddleware, createOptionalVerifyTokenMiddleware } = require("./middleware/auth");
const { createAuthRoutes } = require("./routes/auth");
const createSurveyRoutes = require("./routes/survey");
const { initializeDatabase, createUsersTable, createUserSurveyTable } = require("./config/database");

// Routes
const createRecommendationsRoutes = require('./routes/recommendations');
const booksRoutes = require('./routes/booksRoutes');
const readingSessionRoutes = require('./routes/readingSessionRoutes');

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

// Books Routes (dengan Azure Blob file handling)
app.use('/', booksRoutes);

// Reading Session Routes (track user reading progress)
app.use('/reading', verifyTokenMiddleware, readingSessionRoutes);

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
    console.log("\n⏳ Initializing Database...");
    await initializeDatabase();
    console.log("✅ Database initialized successfully\n");
    
    await createUsersTable();
    const surveyTableReady = await createUserSurveyTable();
    
    app.listen(CONFIG.PORT, async () => {
      console.log(`${CONFIG.MESSAGES.SERVER_RUNNING} ${CONFIG.PORT}`);
      console.log(`Environment: ${CONFIG.NODE_ENV}`);
      console.log(`Auth: Firebase`);
      console.log(`📊 Database: ${dbType}`);

      // Auto-reindex PustarAI (optional, don't crash if fails)
      console.log("\n🤖 Attempting to initialize PustarAI...");
      try {
        const cronSecret = process.env.CRON_SECRET || process.env.RI_SECRET || 'pustara-cron-2025';
        
        const reindexRes = await fetch(`${aiUrl}/reindex?key=${cronSecret}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.HF_TOKEN || ''}`
          }
        });
        
        if (reindexRes.ok) {
          console.log("✅ PustarAI successfully reindexed and is ready!");
        } else {
          console.log(`⚠️  PustarAI reindex returned status ${reindexRes.status} - may still work`);
        }
      } catch (err) {
        console.warn(`⚠️  Could not contact PustarAI: ${err.message}\n    (This is OK if you're offline or AI not needed yet)`);
      }
    });
  } catch (error) {
    console.error("\n❌ FATAL ERROR - Failed to start server:");
    console.error(error.message);
    console.error("\nTroubleshooting steps:");
    console.error("1. Check your .env file has correct DATABASE_URL");
    console.error("2. Check NODE_ENV is set to 'dummy' for local development");
    console.error("3. Check network connectivity");
    process.exit(1);
  }
}

startServer();