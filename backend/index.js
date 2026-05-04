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

console.log('[STARTUP]', new Date().toISOString(), 'index.js loaded');
const fs = require('fs');
fs.writeFileSync('./debug-requests.log', `[${new Date().toISOString()}] === BACKEND STARTED ===\n`);

// Log that we're about to define the "app" routes
fs.appendFileSync('./debug-requests.log', `[${new Date().toISOString()}] Defining app routes...\n`);

// CRITICAL: Polyfill global crypto for @typespec/ts-http-runtime
if (typeof global.crypto === 'undefined') {
  global.crypto = require('crypto').webcrypto;
}

const path = require('path');
require("dotenv").config({ path: path.join(__dirname, '.env') });

const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
const isNeonMode = nodeEnv === 'neon' || process.env.NEON_CLOUD_MODE === 'true';
const dbType = isNeonMode ? 'Neon PostgreSQL (Production Cloud)' : 'Azure SQL';
const aiUrl = process.env.FASTAPI_URL || 'http://localhost:8001';

console.log("🔥 DEBUG URL:", aiUrl);
console.log(`📊 Database Mode: ${isNeonMode ? 'NEON PRODUCTION CLOUD' : 'PRODUCTION (Azure SQL)'}`);
console.log(`🔐 NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);

const express = require("express");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const CONFIG = require("./constants/config");
const FirebaseProvider = require("./providers/firebaseProvider");
const AuthService = require("./services/authService");
const { createVerifyTokenMiddleware, createOptionalVerifyTokenMiddleware } = require("./middleware/auth");
const { authorizeAdmin } = require("./middleware/adminAuth");
const { createAuthRoutes } = require("./routes/auth");
const createSurveyRoutes = require("./routes/survey");
const { initializeDatabase, ensureNeonShelfSchemaCompatibility, createUsersTable, createUserSurveyTable } = require("./config/database");

// Routes
const createRecommendationsRoutes = require('./routes/recommendations');
const booksRoutes = require('./routes/booksRoutes');
const booksAdminRoutes = require('./routes/booksAdminRoutes');
const readingSessionRoutes = require('./routes/readingSessionRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const userRoutes = require('./routes/userRoutes');
const shelfRoutes = require('./routes/shelfRoutes');
const feedRoutes = require('./routes/feedRoutes');

require('./jobs/cron'); //init cron jobs for ai-related tasks

// ==========================================
// INITIALIZE
// ==========================================
const app = express();
const fsDebug = require('fs');
fsDebug.appendFileSync('./debug-requests.log', `[${new Date().toISOString()}] app = express() created\n`);

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
app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  abortOnLimit: true,
  responseOnLimit: 'File size too large (max 50MB)',
  useTempFiles: true,
  tempFileDir: '/tmp/',
}));
app.use(cors({
  origin: CONFIG.CORS_ORIGINS || "http://localhost:3001",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// DEBUG: Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] 📍 ${req.method} ${req.path}`);
  next();
});

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
  require('fs').appendFileSync('./debug-requests.log', `[${new Date().toISOString()}] GET / hit\n`);
  res.json({ message: "Pustara API ready", status: "healthy" });
});

// TEST GET - verify app.get works
app.get("/test-get", (req, res) => {
  const fs = require('fs');
  fs.appendFileSync('./debug-requests.log', `[${new Date().toISOString()}] GET /test-get hit\n`);
  console.log('✅ GET /test-get reached!');
  res.json({ success: true, msg: "GET works" });
});
require('fs').appendFileSync('./debug-requests.log', `[${new Date().toISOString()}] app.get("/test-get") REGISTERED\n`);

// TEST - Different path
app.post("/test-endpoint", (req, res) => {
  console.log('🎯 POST /test-endpoint reached!');
  res.json({ success: true, msg: "test-endpoint works" });
});

// Auth Routes
app.use("/auth", createAuthRoutes(authService, verifyTokenMiddleware));

// Survey Routes
app.use("/survey", createSurveyRoutes(verifyTokenMiddleware));

// Protected Route Example
app.get("/api/protected", verifyTokenMiddleware, (req, res) => {
  res.json({ message: "Protected data", user: req.user });
});

// PROTECTED: Reviews endpoint (requires Firebase auth)
const booksController = require('./controllers/booksController');
app.post('/reviews', verifyTokenMiddleware, booksController.createOrUpdateReview);

// Recommendations Routes
app.use('/recommendations', createRecommendationsRoutes(verifyTokenMiddleware, optionalVerifyTokenMiddleware));

// Books Routes (dengan Azure Blob file handling)
app.use('/', booksRoutes);

// Books Admin Routes (protected by verifyToken + authorizeAdmin)
// IMPORTANT: Mount to /admin prefix to avoid catching all / routes
app.use('/admin/books', verifyTokenMiddleware, authorizeAdmin, booksAdminRoutes);

// Reading Session Routes (track user reading progress)
app.use('/reading', verifyTokenMiddleware, readingSessionRoutes);

// Shelf Routes (loans, reading sessions, wishlist)
app.use('/shelf', verifyTokenMiddleware, shelfRoutes);

// Feed Routes (activity, notifications, recommendations)
app.use('/feed', verifyTokenMiddleware, feedRoutes);

// User Social/Profile Routes (allow optional auth for actor-aware responses)
app.use('/users', optionalVerifyTokenMiddleware, userRoutes);

// Analytics Routes (stats & dashboard)
app.use('/stats', analyticsRoutes);

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
  let dbConnected = false;
  
  try {
    console.log("\n⏳ Initializing Database...");
    console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`   DATABASE_URL set: ${!!process.env.DATABASE_URL}`);
    
    await initializeDatabase();
    try {
      await ensureNeonShelfSchemaCompatibility();
    } catch (schemaError) {
      console.warn(`⚠️  Shelf schema compatibility check skipped: ${schemaError.message}`);
    }
    console.log("✅ Database initialized successfully\n");
    
    await createUsersTable();
    const surveyTableReady = await createUserSurveyTable();
    dbConnected = true;
  } catch (dbError) {
    console.error("\n❌ Database initialization FAILED:");
    console.error(`   Error: ${dbError.message}`);
    console.error(`   Stack: ${dbError.stack}`);
    console.error("   ⚠️  API endpoints that need database will return 500 errors\n");
  }
  
  // Start server even if DB failed
  app.listen(CONFIG.PORT, async () => {
    console.log(`${CONFIG.MESSAGES.SERVER_RUNNING} ${CONFIG.PORT}`);
    console.log(`Environment: ${CONFIG.NODE_ENV}`);
    console.log(`Auth: Firebase`);
    console.log(`📊 Database: ${dbType} ${dbConnected ? '✅' : '⚠️ OFFLINE'}`);

    // Auto-reindex PustarAI (optional, don't crash if fails)
    console.log("\n🤖 Attempting to initialize PustarAI...");
    try {
      const cronSecret = process.env.CRON_SECRET || process.env.RI_SECRET || 'PUSTARAbrakadaba23';

      const reindexRes = await fetch(`${aiUrl}/reindex`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ secret: cronSecret }),
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
}

startServer();