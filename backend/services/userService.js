/**
 * User Service — Database Operations
 * Support Neon PostgreSQL (Production Cloud) dan Azure SQL (prod)
 * Query ditulis dalam PostgreSQL syntax — executeQuery() handle konversi ke Azure
 */

const { executeQuery, isNeon } = require('../config/database');

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
      console.log(`📝 Creating user: uid=${uid}, email=${email}`);

      let rows;
      if (isNeon) {
        // Neon: users punya kolom firebase_uid, username, display_name
        const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
        rows = await executeQuery(`
          INSERT INTO users (firebase_uid, username, display_name, email)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (firebase_uid) DO UPDATE SET updated_at = NOW()
          RETURNING *
        `, [uid, username, displayName || username, email]);
      } else {
        // Azure SQL
        const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
        rows = await executeQuery(`
          IF NOT EXISTS (SELECT 1 FROM users WHERE firebase_uid = @p1)
          BEGIN
            INSERT INTO users (firebase_uid, username, email, display_name)
            VALUES (@p1, @p2, @p3, @p4);
          END
          SELECT * FROM users WHERE firebase_uid = @p1;
        `, [uid, username, email, displayName || username]);
      }

      console.log(`✅ User created: ${uid}`);
      return { success: true, data: rows[0] };
    } catch (error) {
      console.error(`❌ createUser error:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user by Firebase UID
   */
  static async getUserByUid(uid) {
    try {
      const col  = isNeon ? 'firebase_uid' : 'uid';
      const rows = await executeQuery(`SELECT * FROM ${isNeon ? 'users' : 'Users'} WHERE ${col} = $1`, [uid]);
      return { success: true, data: rows[0] || null };
    } catch (error) {
      console.error('getUserByUid error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(email) {
    try {
      const rows = await executeQuery(`SELECT * FROM ${isNeon ? 'users' : 'Users'} WHERE email = $1`, [email]);
      return { success: true, data: rows[0] || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async updateUser(uid, updates) {
    try {
      const allowed = isNeon
        ? ['display_name', 'avatar_url', 'bio', 'preferred_genres']
        : ['display_name', 'avatar_url', 'bio', 'preferred_genres'];

      const fields = Object.keys(updates).filter(k => allowed.includes(k));
      if (!fields.length) return { success: false, error: 'No valid fields to update' };

      const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      const values    = [uid, ...fields.map(f => updates[f])];
      
      let rows;
      if (isNeon) {
        // Neon (PostgreSQL) mode
        rows = await executeQuery(
          `UPDATE users SET ${setClause}, updated_at = NOW() WHERE firebase_uid = $1 RETURNING *`,
          values
        );
      } else {
        // Azure SQL mode (GETDATE() dan w/o RETURNING)
        rows = await executeQuery(
          `UPDATE users SET ${setClause}, updated_at = GETDATE() WHERE firebase_uid = $1;
           SELECT * FROM users WHERE firebase_uid = $1;`,
          values
        );
      }

      return { success: true, data: rows[0] };
    } catch (error) {
      console.error('❌ updateUser error:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async userExists(uid) {
    const result = await this.getUserByUid(uid);
    return result.success && result.data !== null;
  }
}

module.exports = UserService;