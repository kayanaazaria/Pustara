/**
 * Analytics Service
 * Provides statistics for active users and reading time
 */

const { getPool } = require('../config/database');

/**
 * Get active users statistics
 * @param {number} hours - Look back N hours (default: 24)
 */
async function getActiveUsers(hours = 24) {
  try {
    const pool = getPool();

    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT user_id) as active_count,
        COUNT(DISTINCT book_id) as books_being_read,
        ROUND(AVG(progress_percentage), 2) as avg_progress
      FROM reading_sessions
      WHERE last_read_at >= NOW() - INTERVAL '${hours} hours'
        AND status IN ('reading', 'paused')
    `);

    return {
      active_users: result.rows[0].active_count || 0,
      books_being_read: result.rows[0].books_being_read || 0,
      avg_progress: result.rows[0].avg_progress || 0,
      time_period_hours: hours,
    };
  } catch (error) {
    console.error('Error fetching active users:', error.message);
    throw error;
  }
}

/**
 * Get reading time statistics
 * @param {string} period - 'today' | 'week' | 'month' | 'all'
 */
async function getReadingTimeStats(period = 'week') {
  try {
    const pool = getPool();

    let interval;
    switch (period.toLowerCase()) {
      case 'today':
        interval = "1 day";
        break;
      case 'week':
        interval = "7 days";
        break;
      case 'month':
        interval = "30 days";
        break;
      default:
        interval = null;
    }

    let query = `
      SELECT 
        SUM(reading_time_minutes) as total_minutes,
        ROUND(AVG(reading_time_minutes), 2) as avg_minutes_per_session,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT user_id) as unique_readers,
        MAX(reading_time_minutes) as max_session_minutes
      FROM reading_sessions
    `;

    if (interval) {
      query += ` WHERE last_read_at >= NOW() - INTERVAL '${interval}'`;
    }

    const result = await pool.query(query);

    return {
      total_minutes_read: result.rows[0].total_minutes || 0,
      avg_minutes_per_session: result.rows[0].avg_minutes_per_session || 0,
      total_sessions: result.rows[0].total_sessions || 0,
      unique_readers: result.rows[0].unique_readers || 0,
      max_session_minutes: result.rows[0].max_session_minutes || 0,
      period: period,
    };
  } catch (error) {
    console.error('Error fetching reading time stats:', error.message);
    throw error;
  }
}

/**
 * Get reading history for a specific user
 * @param {string} userId - User UID
 * @param {number} limit - Number of records
 */
async function getUserReadingHistory(userId, limit = 20) {
  try {
    const pool = getPool();

    const result = await pool.query(`
      SELECT 
        rs.id,
        rs.book_id,
        b.title,
        b.authors,
        rs.current_page,
        rs.total_pages,
        rs.progress_percentage,
        rs.status,
        rs.reading_time_minutes,
        rs.started_at,
        rs.last_read_at,
        rs.finished_at
      FROM reading_sessions rs
      JOIN books b ON rs.book_id = b.id
      WHERE rs.user_id = $1
      ORDER BY rs.last_read_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching user reading history:', error.message);
    throw error;
  }
}

/**
 * Get top books by reading sessions
 * @param {number} limit - Number of top books
 */
async function getTopBooks(limit = 10) {
  try {
    const pool = getPool();

    const result = await pool.query(`
      SELECT 
        b.id,
        b.title,
        b.authors,
        b.cover_url,
        COUNT(DISTINCT rs.user_id) as reader_count,
        SUM(rs.reading_time_minutes) as total_reading_minutes,
        ROUND(AVG(rs.progress_percentage), 2) as avg_progress
      FROM books b
      LEFT JOIN reading_sessions rs ON b.id = rs.book_id
      WHERE b.is_active = true
      GROUP BY b.id, b.title, b.authors, b.cover_url
      ORDER BY reader_count DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching top books:', error.message);
    throw error;
  }
}

module.exports = {
  getActiveUsers,
  getReadingTimeStats,
  getUserReadingHistory,
  getTopBooks,
};
