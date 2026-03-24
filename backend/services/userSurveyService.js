/**
 * User Survey Service - Database Operations
 * Handles CRUD operations untuk user survey data di Azure SQL & Neon (Dummy)
 */

const { executeQuery, isDummy } = require('../config/database');
const UserService = require('./userService');

class UserSurveyService {
  /**
   * Save survey response untuk user
   */
  static async saveSurvey(uid, surveyData) {
    try {
      const userResult = await UserService.getUserByUid(uid);
      if (!userResult.success || !userResult.data) {
        return { success: false, error: 'User not found in database. Please ensure you are logged in.' };
      }
      const userId = userResult.data.id;

      const { gender, age, favoriteGenre } = surveyData;
      const favoriteGenreStr = Array.isArray(favoriteGenre) ? favoriteGenre.join(', ') : favoriteGenre;
      
      let query = '';

      if (isDummy) {
        query = `
          INSERT INTO UserSurvey (userId, gender, age, favoriteGenre) 
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (userId) DO UPDATE 
          SET gender = EXCLUDED.gender, 
              age = EXCLUDED.age, 
              favoriteGenre = EXCLUDED.favoriteGenre, 
              updatedAt = NOW()
        `;
      } else {
        query = `
          MERGE UserSurvey AS target
          USING (SELECT $1 AS userId, $2 AS gender, $3 AS age, $4 AS favoriteGenre) AS source
          ON (target.userId = source.userId)
          WHEN MATCHED THEN
              UPDATE SET gender = source.gender, age = source.age, favoriteGenre = source.favoriteGenre, updatedAt = GETDATE()
          WHEN NOT MATCHED THEN
              INSERT (userId, gender, age, favoriteGenre) VALUES (source.userId, source.gender, source.age, source.favoriteGenre);
        `;
      }

      await executeQuery(query, [userId, gender, age, favoriteGenreStr]);

      return { success: true, message: 'Survey saved successfully' };
    } catch (error) {
      console.error('Error saving survey:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user survey by UID
   */
  static async getSurveyByUid(uid) {
    try {
      const userCol = isDummy ? 'firebase_uid' : 'uid';
      const userTable = isDummy ? 'users' : 'Users';
      
      const query = `
        SELECT us.* FROM UserSurvey us
        JOIN ${userTable} u ON us.userId = u.id
        WHERE u.${userCol} = $1
      `;

      const rows = await executeQuery(query, [uid]);
      return { success: true, data: rows[0] || null };
    } catch (error) {
      console.error('Error getting survey:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update survey
   */
  static async updateSurvey(userId, updates) {
    try {
      const allowedFields = ['favoriteGenre', 'age', 'gender'];
      const fields = Object.keys(updates).filter(k => allowedFields.includes(k));
      
      if (fields.length === 0) {
        return { success: false, error: 'No valid fields to update' };
      }

      const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      const values = [userId, ...fields.map(f => updates[f])];
      const timeFunc = isDummy ? 'NOW()' : 'GETDATE()';
      
      let query = '';

      if (isDummy) {
        query = `
          UPDATE UserSurvey
          SET ${setClause}, updatedAt = ${timeFunc}
          WHERE userId = $1
          RETURNING *
        `;
      } else {
        query = `
          UPDATE UserSurvey
          SET ${setClause}, updatedAt = ${timeFunc}
          WHERE userId = $1;
          SELECT * FROM UserSurvey WHERE userId = $1;
        `;
      }

      const rows = await executeQuery(query, values);
      return { success: true, data: rows[0] };
    } catch (error) {
      console.error('Error updating survey:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user with survey data
   */
  static async getUserWithSurvey(uid) {
    try {
      const userCol = isDummy ? 'firebase_uid' : 'uid';
      const userTable = isDummy ? 'users' : 'Users';
      
      // Ambil detail survey yang relevan sesuai skema
      const query = `
        SELECT u.*, us.favoriteGenre, us.age, us.gender
        FROM ${userTable} u
        LEFT JOIN UserSurvey us ON u.id = us.userId
        WHERE u.${userCol} = $1
      `;

      const rows = await executeQuery(query, [uid]);
      return { success: true, data: rows[0] || null };
    } catch (error) {
      console.error('Error getting user with survey:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = UserSurveyService;