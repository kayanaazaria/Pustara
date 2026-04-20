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

// CRITICAL: Polyfill global crypto for @typespec/ts-http-runtime
if (typeof global.crypto === 'undefined') {
  global.crypto = require('crypto').webcrypto;
}

require("dotenv").config();

console.log("📂 Working directory:", process.cwd());
console.log("📂 .env exists at:", require('fs').existsSync('.env'));
console.log("📝 FIREBASE_API_KEY loaded:", !!process.env.FIREBASE_API_KEY);

const isDummyMode = process.env.NODE_ENV === 'dummy';
const dbType = isDummyMode ? 'Neon PostgreSQL' : 'Azure SQL';
const aiUrl = process.env.FASTAPI_URL || 'http://localhost:8001';

console.log("🔥 DEBUG URL:", aiUrl);
console.log(`📊 Database Mode: ${isDummyMode ? 'DUMMY (Neon PG)' : 'PRODUCTION (Azure SQL)'}`);
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
const { initializeDatabase, createUsersTable, createUserSurveyTable } = require("./config/database");

// Routes
const createRecommendationsRoutes = require('./routes/recommendations');
const booksRoutes = require('./routes/booksRoutes');
const booksAdminRoutes = require('./routes/booksAdminRoutes');
const readingSessionRoutes = require('./routes/readingSessionRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

require('./jobs/cron'); //init cron jobs for ai-related tasks

// ==========================================
// INITIALIZE
// ==========================================
const app = express();

// CORS setup
const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(__dirname, 'debug-requests.log');
app.use((req, res, next) => {
  const logMsg = `[${new Date().toISOString()}] ${req.method} ${req.path}\n`;
  console.log(`[REQUEST] ${req.method} ${req.path}`);
  fs.appendFileSync(LOG_FILE, logMsg);
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

// REQUEST LOGGING MIDDLEWARE
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.path} - From: ${req.headers.origin || 'unknown'}`);
  next();
});

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

// Setup Auth
let authService, verifyTokenMiddleware, optionalVerifyTokenMiddleware;
try {
  const authProvider = new FirebaseProvider();
  authService = new AuthService(authProvider);
  verifyTokenMiddleware = createVerifyTokenMiddleware(authService);
  optionalVerifyTokenMiddleware = createOptionalVerifyTokenMiddleware(authService);
  console.log('✅ Auth services initialized successfully');
} catch (authErr) {
  console.error('❌ Auth initialization failed:', authErr.message);
  process.exit(1);
}

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

// DEVELOPMENT: Serve local uploaded files
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));
console.log(`📁 Static uploads served from: ${uploadsDir}`);

// Books Routes (dengan local filesystem file handling untuk development)
app.use('/', booksRoutes);

// Books Admin Routes (protected by verifyToken + authorizeAdmin)
// IMPORTANT: Mount to /admin prefix to avoid catching all / routes
app.use('/admin/books', verifyTokenMiddleware, authorizeAdmin, booksAdminRoutes);

// Reading Session Routes (track user reading progress)
app.use('/reading', verifyTokenMiddleware, readingSessionRoutes);

// Analytics Routes (stats & dashboard)
app.use('/stats', analyticsRoutes);

// Cron Routes
app.use('/cron', require('./routes/cronRoutes'));

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
  console.error("[ERROR HANDLER]", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({ success: false, error: CONFIG.ERRORS.INTERNAL_SERVER_ERROR });
});

// ==========================================
// START SERVER
// ==========================================
async function startServer() {
  let dbConnected = false;
  
  try {
    console.log("\n⏳ Initializing Database...");
    await initializeDatabase();
    console.log("✅ Database initialized successfully\n");
    
    await createUsersTable();
    const surveyTableReady = await createUserSurveyTable();
    dbConnected = true;
  } catch (dbError) {
    console.warn("\n⚠️  Database initialization failed (running in offline mode):");
    console.warn(`   ${dbError.message}`);
    console.warn("   You can still use the API with limited functionality\n");
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
}

startServer();