/**
 * Firebase Authentication Provider
 * Abstraction layer untuk Firebase auth logic
 * 
 * Ini layer abstraction supaya nanti mudah ganti ke Azure AD
 * tanpa perlu ubah logic di service/routes
 */

const admin = require("../config/firebase");

class FirebaseProvider {
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
      if (!apiKey) {
        return {
          success: false,
          error: "FIREBASE_API_KEY not configured",
        };
      }

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

      if (!data.idToken) {
        // Map Firebase error codes to user-friendly messages
        let friendlyError = "Sign in failed";
        if (data.error?.message) {
          const errorMsg = data.error.message.toUpperCase();
          if (errorMsg.includes('EMAIL_NOT_FOUND')) friendlyError = "Email tidak terdaftar";
          else if (errorMsg.includes('INVALID_PASSWORD')) friendlyError = "Password salah";
          else if (errorMsg.includes('USER_DISABLED')) friendlyError = "Akun dinonaktifkan";
          else if (errorMsg.includes('TOO_MANY_ATTEMPTS')) friendlyError = "Terlalu banyak percobaan login. Coba lagi nanti";
          else friendlyError = data.error.message;
        }
        console.log(`[FIREBASE] Error:`, { original: data.error?.message, friendly: friendlyError });
        return {
          success: false,
          error: friendlyError,
        };
      }

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
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = FirebaseProvider;
