/**
 * Firebase Admin SDK Initialization
 * Centralized Firebase configuration
 */

const admin = require("firebase-admin");

// Load service account credentials
const serviceAccount = require("../pustara-kw-firebase-adminsdk-fbsvc-e6e1ebe356.json");

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

console.log("🔐 Firebase Admin SDK initialized");

// Export Firebase admin instance
module.exports = admin;
   