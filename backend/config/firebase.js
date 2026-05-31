const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function loadServiceAccount() {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    try {
      return JSON.parse(inlineJson);
    } catch (error) {
      throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error.message}`);
    }
  }

  // Support base64-encoded service account JSON (useful for deployment env vars)
  const inlineB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (inlineB64) {
    try {
      const decoded = Buffer.from(inlineB64, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (error) {
      throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_B64: ${error.message}`);
    }
  }

  const fallbackFiles = fs
    .readdirSync(path.join(__dirname, '..'))
    .filter(fileName => /firebase-adminsdk.*\.json$/i.test(fileName))
    .map(fileName => path.join(__dirname, '..', fileName));

  if (fallbackFiles.length > 0) {
    return JSON.parse(fs.readFileSync(fallbackFiles[0], 'utf8'));
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    throw new Error(
      'Firebase Admin credentials are missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY, or provide FIREBASE_SERVICE_ACCOUNT_JSON.'
    );
  }

  return {
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: privateKey.replace(/\\n/g, '\n'),
  };
}

if (!admin.apps.length) {
  const serviceAccount = loadServiceAccount();

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('🔥 Firebase Admin SDK initialized successfully');
}

module.exports = admin;