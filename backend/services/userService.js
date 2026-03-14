/**
 * User Service - Database Operations
 * Handles CRUD operations untuk user data di Azure SQL
 */

const { getPool } = require('../config/database');

class UserService {
  /**
   * Save user to database (signup)
   * @param {string} uid - Firebase UID
   * @param {string} email - User email
   * @param {string} displayName - User display name (optional)
   * @returns {Promise<Object>} - Created user atau error
   */
  static async createUser(uid, email, displayName = null) {
    try {
      const pool = getPool();
      
      console.log(`📝 Creating user in DB: uid=${uid}, email=${email}`);
      
      const query = `
        INSERT INTO Users (uid, email, displayName)
        VALUES (@uid, @email, @displayName);
        SELECT * FROM Users WHERE uid = @uid;
      `;

      const result = await pool
        .request()
        .input('uid', uid)
        .input('email', email)
        .input('displayName', displayName || email.split('@')[0])
        .query(query);

      console.log(`✅ User created successfully: ${uid}`);
      return {
        success: true,
        data: result.recordset[0],
      };
    } catch (error) {
      console.error(`❌ Error creating user ${uid}:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user by UID
   * @param {string} uid - Firebase UID
   * @returns {Promise<Object>} - User data atau null
   */
  static async getUserByUid(uid) {
    try {
      const pool = getPool();
      
      const query = `SELECT * FROM Users WHERE uid = @uid;`;
      const result = await pool
        .request()
        .input('uid', uid)
        .query(query);

      return {
        success: true,
        data: result.recordset[0] || null,
      };
    } catch (error) {
      console.error('Error getting user:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object>} - User data atau null
   */
  static async getUserByEmail(email) {
    try {
      const pool = getPool();
      
      const query = `SELECT * FROM Users WHERE email = @email;`;
      const result = await pool
        .request()
        .input('email', email)
        .query(query);

      return {
        success: true,
        data: result.recordset[0] || null,
      };
    } catch (error) {
      console.error('Error getting user by email:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update user profile
   * @param {string} uid - Firebase UID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Updated user atau error
   */
  static async updateUser(uid, updates) {
    try {
      const pool = getPool();
      const allowedFields = ['displayName', 'photoURL'];
      
      // Build dynamic update query
      let setClause = [];
      const request = pool.request().input('uid', uid);
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClause.push(`${key} = @${key}`);
          request.input(key, value);
        }
      }

      if (setClause.length === 0) {
        return {
          success: false,
          error: 'No valid fields to update',
        };
      }

      setClause.push('updatedAt = GETDATE()');

      const query = `
        UPDATE Users
        SET ${setClause.join(', ')}
        WHERE uid = @uid;
        SELECT * FROM Users WHERE uid = @uid;
      `;

      const result = await request.query(query);

      return {
        success: true,
        data: result.recordset[0],
      };
    } catch (error) {
      console.error('Error updating user:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Check if user exists
   * @param {string} uid - Firebase UID
   * @returns {Promise<boolean>}
   */
  static async userExists(uid) {
    try {
      const result = await this.getUserByUid(uid);
      return result.success && result.data !== null;
    } catch (error) {
      console.error('Error checking user existence:', error);
      return false;
    }
  }
}

module.exports = UserService;
