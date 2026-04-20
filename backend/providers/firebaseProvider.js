/**
 * Firebase Authentication Provider
 * Abstraction layer untuk Firebase auth logic
 * 
 * Ini layer abstraction supaya nanti mudah ganti ke Azure AD
 * tanpa perlu ubah logic di service/routes
 */

const admin = require("../config/firebase");

class FirebaseProvider {
  constructor() {
    console.log('[FIREBASE] FirebaseProvider constructor called');
    console.log('[FIREBASE] process.env.FIREBASE_API_KEY at construct time:', process.env.FIREBASE_API_KEY ? 'SET' : 'UNDEFINED');
  }

  /**
   * Verify ID token dari Firebase
   * @param {string} token - Firebase ID token
   * @returns {Promise<Object>} - Decoded token dengan user info
   */
  async verifyToken(token) {
    try {
      if (!token || token.length < 10) {
        return {
          success: false,
          error: "Invalid token format - token is too short",
        };
      }

      const decodedToken = await admin.auth().verifyIdToken(token);
      console.log("✅ Token verified successfully:", decodedToken.uid);
      
      return {
        success: true,
        data: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email?.split("@")[0],
          emailVerified: decodedToken.email_verified,
        },
      };
    } catch (error) {
      console.error("❌ Token verification error:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user by UID
   * @param {string} uid - User UID
   * @returns {Promise<Object>} - User data
   */
  async getUser(uid) {
    try {
      const user = await admin.auth().getUser(uid);
      return {
        success: true,
        data: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create user dengan email & password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} - Created user data
   */
  async createUser(email, password) {
    try {
      const user = await admin.auth().createUser({
        email,
        password,
      });
      return {
        success: true,
        data: {
          uid: user.uid,
          email: user.email,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete user
   * @param {string} uid - User UID
   * @returns {Promise<Object>} - Delete result
   */
  async deleteUser(uid) {
    try {
      await admin.auth().deleteUser(uid);
      return {
        success: true,
        message: "User deleted successfully",
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sign in dengan email & password (Return ID Token)
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} - ID Token & user info
   */
  async signInWithEmailPassword(email, password) {
    try {
      const apiKey = process.env.FIREBASE_API_KEY;
      
      console.log('[FIREBASE] ===== signInWithEmailPassword called =====');
      console.log('[FIREBASE] Email:', email);
      console.log('[FIREBASE] API Key Status:', apiKey ? 'LOADED (length: ' + apiKey.length + ')' : 'UNDEFINED');
      
      if (!apiKey) {
        console.error('[FIREBASE] ❌ ERROR: FIREBASE_API_KEY is undefined!');
        return {
          success: false,
          error: "FIREBASE_API_KEY not configured",
        };
      }

      console.log('[FIREBASE] ✅ API Key exists, attempting Firebase sign-in...');

      console.log(`[FIREBASE] Attempting sign-in for ${email}`);
      const signInUrl = `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${apiKey}`;

      const response = await fetch(signInUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      });

      const data = await response.json();
      console.log(`[FIREBASE] Response status: ${response.status}`, { hasIdToken: !!data.idToken, hasError: !!data.error });

      if (!data.idToken) {
        const errorMsg = data.error?.message || "Sign in failed";
        console.error(`[FIREBASE] Sign-in failed for ${email}:`, errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      }

      console.log(`[FIREBASE] ✅ Sign-in successful for ${email}`);
      return {
        success: true,
        data: {
          idToken: data.idToken,
          uid: data.localId,
          email: data.email,
          refreshToken: data.refreshToken,
        },
      };
    } catch (error) {
      console.error(`[FIREBASE] Exception during sign-in:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = FirebaseProvider;
