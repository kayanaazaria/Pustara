/**
 * Reading Session Service
 * Smart reading progress tracking: halaman, durasi baca, status
 */

const db = require('../config/database');

/**
 * Start atau update reading session
 * Progress tracking dengan 3 cara:
 * 1. Current page (user input halaman berapa sekarang)
 * 2. Calculated percentage (otomatis dari current_page/total_pages)
 * 3. Reading time (berapa lama sudah baca)
 */
exports.updateReadingProgress = async (userId, bookId, currentPage, readingTimeMinutes) => {
  try {
    const pool = require('../config/database').getPool();

    // Get book details
    const bookResult = await pool.query(
      'SELECT id, pages FROM books WHERE id = $1',
      [bookId]
    );

    if (bookResult.rows.length === 0) {
      return { success: false, message: 'Buku tidak ditemukan' };
    }

    const totalPages = parseInt(bookResult.rows[0].pages) || 0;
    const validCurrentPage = Math.min(parseInt(currentPage) || 0, totalPages);
    const progressPercentage = totalPages > 0 
      ? Math.round((validCurrentPage / totalPages) * 100) 
      : 0;

    // Check if session exists
    const existingResult = await pool.query(
      `SELECT id, reading_time_minutes FROM reading_sessions 
       WHERE user_id = $1 AND book_id = $2`,
      [userId, bookId]
    );

    const now = new Date();

    if (existingResult.rows.length > 0) {
      // Update existing session
      const session = existingResult.rows[0];
      const newReadingTime = (parseInt(session.reading_time_minutes) || 0) + (readingTimeMinutes || 0);

      const updateResult = await pool.query(
        `UPDATE reading_sessions
         SET current_page = $1,
             progress_percentage = $2,
             last_read_at = $3,
             reading_time_minutes = $4,
             status = CASE
               WHEN $2 >= 100 THEN 'finished'
               ELSE 'reading'
             END
         WHERE user_id = $5 AND book_id = $6
         RETURNING *`,
        [validCurrentPage, progressPercentage, now, newReadingTime, userId, bookId]
      );

      return {
        success: true,
        data: updateResult.rows[0],
        message: `Progress update: ${validCurrentPage}/${totalPages} halaman (${progressPercentage}%)`,
      };
    } else {
      // Create new session
      const createResult = await pool.query(
        `INSERT INTO reading_sessions 
         (user_id, book_id, current_page, total_pages, progress_percentage, started_at, last_read_at, reading_time_minutes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reading')
         RETURNING *`,
        [userId, bookId, validCurrentPage, totalPages, progressPercentage, now, now, readingTimeMinutes || 0]
      );

      return {
        success: true,
        data: createResult.rows[0],
        message: `Mulai membaca: ${validCurrentPage}/${totalPages} halaman`,
      };
    }
  } catch (error) {
    console.error('Error updating reading progress:', error.message);
    return { success: false, message: error.message };
  }
};

/**
 * Mark reading as finished
 */
exports.finishReading = async (userId, bookId) => {
  try {
    const pool = require('../config/database').getPool();

    const finishedAt = new Date();

    const result = await pool.query(
      `UPDATE reading_sessions
       SET status = 'finished', finished_at = $1, progress_percentage = 100
       WHERE user_id = $2 AND book_id = $3
       RETURNING *`,
      [finishedAt, userId, bookId]
    );

    if (result.rows.length === 0) {
      return { success: false, message: 'Reading session tidak ditemukan' };
    }

    return {
      success: true,
      data: result.rows[0],
      message: 'Selamat! Buku selesai dibaca 🎉',
    };
  } catch (error) {
    console.error('Error finishing reading:', error.message);
    return { success: false, message: error.message };
  }
};

/**
 * Pause reading session
 */
exports.pauseReading = async (userId, bookId) => {
  try {
    const pool = require('../config/database').getPool();

    const result = await pool.query(
      `UPDATE reading_sessions
       SET status = 'paused'
       WHERE user_id = $1 AND book_id = $2
       RETURNING *`,
      [userId, bookId]
    );

    if (result.rows.length === 0) {
      return { success: false, message: 'Reading session tidak ditemukan' };
    }

    return {
      success: true,
      data: result.rows[0],
      message: 'Pembacaan dijeda. Lanjutkan kapan saja!',
    };
  } catch (error) {
    console.error('Error pausing reading:', error.message);
    return { success: false, message: error.message };
  }
};

/**
 * Resume reading from pause
 */
exports.resumeReading = async (userId, bookId) => {
  try {
    const pool = require('../config/database').getPool();

    const now = new Date();

    const result = await pool.query(
      `UPDATE reading_sessions
       SET status = 'reading', last_read_at = $1
       WHERE user_id = $2 AND book_id = $3
       RETURNING *`,
      [now, userId, bookId]
    );

    if (result.rows.length === 0) {
      return { success: false, message: 'Reading session tidak ditemukan' };
    }

    return {
      success: true,
      data: result.rows[0],
      message: 'Mari lanjut membaca!',
    };
  } catch (error) {
    console.error('Error resuming reading:', error.message);
    return { success: false, message: error.message };
  }
};

/**
 * Get reading statistics untuk user
 */
exports.getReadingStats = async (userId) => {
  try {
    const pool = require('../config/database').getPool();

    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'reading') as currently_reading,
         COUNT(*) FILTER (WHERE status = 'finished') as books_finished,
         COUNT(*) FILTER (WHERE status = 'paused') as books_paused,
         ROUND(AVG(NULLIF(progress_percentage, 0))::numeric, 1) as avg_progress,
         SUM(reading_time_minutes) as total_reading_minutes,
         MAX(last_read_at) as last_read_at
       FROM reading_sessions
       WHERE user_id = $1`,
      [userId]
    );

    const stats = result.rows[0];

    return {
      currentlyReading: parseInt(stats.currently_reading) || 0,
      booksFinished: parseInt(stats.books_finished) || 0,
      booksPaused: parseInt(stats.books_paused) || 0,
      avgProgress: parseFloat(stats.avg_progress) || 0,
      totalReadingHours: Math.round((parseInt(stats.total_reading_minutes) || 0) / 60),
      lastReadAt: stats.last_read_at,
    };
  } catch (error) {
    console.error('Error getting reading stats:', error.message);
    return null;
  }
};

/**
 * Calculate reading habit insights
 * Saran untuk user berdasarkan pattern membaca
 */
exports.getReadingInsights = async (userId) => {
  try {
    const pool = require('../config/database').getPool();

    // Get top 3 genres user paling sering baca
    const genresResult = await pool.query(
      `SELECT 
         jsonb_array_elements(b.genres)::text as genre,
         COUNT(*) as count
       FROM reading_sessions rs
       JOIN books b ON rs.book_id = b.id
       WHERE rs.user_id = $1 AND rs.status = 'finished'
       GROUP BY genre
       ORDER BY count DESC
       LIMIT 3`,
      [userId]
    );

    // Calculate average reading streak (berapa lama baca per hari)
    const streakResult = await pool.query(
      `SELECT
         AVG(reading_time_minutes) as avg_daily_reading,
         MAX(reading_time_minutes) as max_daily_reading
       FROM reading_sessions
       WHERE user_id = $1 AND status != 'paused'`,
      [userId]
    );

    const topGenres = genresResult.rows.map(r => r.genre);
    const avgDailyReading = parseInt(streakResult.rows[0]?.avg_daily_reading) || 0;

    return {
      favoriteGenres: topGenres,
      avgDailyReadingMinutes: avgDailyReading,
      suggestion: generateReadingSuggestion(avgDailyReading, topGenres),
    };
  } catch (error) {
    console.error('Error getting reading insights:', error.message);
    return null;
  }
};

/**
 * Generate personalized reading suggestion
 */
function generateReadingSuggestion(avgDailyMinutes, favoriteGenres) {
  let suggestion = '📚 ';

  if (avgDailyMinutes === 0) {
    suggestion += 'Mulai membaca sekarang! Bahkan 10 menit sehari cukup untuk terbentuk kebiasaan baik.';
  } else if (avgDailyMinutes < 15) {
    suggestion += 'Hebat mulai baca! Coba naikkan target jadi 20 menit/hari untuk hasil maksimal.';
  } else if (avgDailyMinutes < 30) {
    suggestion += 'Konsisten! Kamu pembaca yang bagus. Coba eksplorasi genre baru selain ' + (favoriteGenres[0] || 'favorit') + '.';
  } else {
    suggestion += 'Wow, pembaca sejati! Kamu sudah membentuk habit membaca yang sempurna.';
  }

  return suggestion;
}
