/**
 * User Survey Service - Database Operations
 * Handles CRUD operations untuk user survey data di Azure SQL
 */

const { getPool } = require('../config/database');
const UserService = require('./userService');

class UserSurveyService {
  /**
   * Save survey response untuk user
   * @param {string} uid - Firebase UID
   * @param {Object} surveyData - Survey responses
   * @returns {Promise<Object>} - Created survey atau error
   */
  static async saveSurvey(uid, surveyData) {
    try {
      const pool = getPool();
      
      // Get user first
      let userResult = await UserService.getUserByUid(uid);
      
      if (!userResult.data) {
        return {
          success: false,
          error: 'User not found in database. Please ensure you are logged in.',
        };
      }

      const userId = userResult.data.id;

      // Check if survey already exists
      const checkQuery = `SELECT * FROM UserSurvey WHERE userId = @userId`;
      const checkResult = await pool.request()
        .input('userId', userId)
        .query(checkQuery);

      if (checkResult.recordset.length > 0) {
        // Update existing survey
        return this.updateSurvey(userId, surveyData);
      }

      // Insert new survey
      const query = `
        INSERT INTO UserSurvey (userId, favoriteGenre, age, gender)
        VALUES (@userId, @favoriteGenre, @age, @gender);
        SELECT * FROM UserSurvey WHERE userId = @userId;
      `;

      const result = await pool
        .request()
        .input('userId', userId)
        .input('favoriteGenre', surveyData.favoriteGenre || null)
        .input('age', surveyData.age || null)
        .input('gender', surveyData.gender || null)
        .query(query);

      return {
        success: true,
        data: result.recordset[0],
      };
    } catch (error) {
      console.error('Error saving survey:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user survey by UID
   * @param {string} uid - Firebase UID
   * @returns {Promise<Object>} - Survey data atau null
   */
  static async getSurveyByUid(uid) {
    try {
      const pool = getPool();
      
      const query = `
        SELECT us.* FROM UserSurvey us
        JOIN Users u ON us.userId = u.id
        WHERE u.uid = @uid
      `;

      const result = await pool
        .request()
        .input('uid', uid)
        .query(query);

      return {
        success: true,
        data: result.recordset[0] || null,
      };
    } catch (error) {
      console.error('Error getting survey:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update survey
   * @param {number} userId - User ID
   * @param {Object} updates - Survey updates
   * @returns {Promise<Object>} - Updated survey atau error
   */
  static async updateSurvey(userId, updates) {
    try {
      const pool = getPool();
      
      const allowedFields = ['favoriteGenre', 'age', 'gender'];
      
      let setClause = [];
      const request = pool.request().input('userId', userId);
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClause.push(`${key} = @${key}`);
          request.input(key, value || null);
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
        UPDATE UserSurvey
        SET ${setClause.join(', ')}
        WHERE userId = @userId;
        SELECT * FROM UserSurvey WHERE userId = @userId;
      `;

      const result = await request.query(query);

      return {
        success: true,
        data: result.recordset[0],
      };
    } catch (error) {
      console.error('Error updating survey:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user with survey data
   * @param {string} uid - Firebase UID
   * @returns {Promise<Object>} - Combined user + survey data
   */
  static async getUserWithSurvey(uid) {
    try {
      const pool = getPool();
      
      const query = `
        SELECT u.*, us.favoriteGenre, us.readingLevel, us.preferredLanguage
        FROM Users u
        LEFT JOIN UserSurvey us ON u.id = us.userId
        WHERE u.uid = @uid
      `;

      const result = await pool
        .request()
        .input('uid', uid)
        .query(query);

      return {
        success: true,
        data: result.recordset[0] || null,
      };
    } catch (error) {
      console.error('Error getting user with survey:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = UserSurveyService;
