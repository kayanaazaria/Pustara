/**
 * Admin Authorization Middleware
 * Checks if user has admin role in database
 */

const { getPool } = require('../config/database');

/**
 * Middleware to check user is admin
 * Must be used AFTER verifyToken middleware (req.user must exist)
 */
async function authorizeAdmin(req, res, next) {
  try {
    // Check if user exists from previous middleware
    if (!req.user || !req.user.uid) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const pool = getPool();

    // Query user from database to verify admin role
    const result = await pool.query(
      'SELECT firebase_uid, role FROM users WHERE firebase_uid = $1',
      [req.user.uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found in database',
      });
    }

    const user = result.rows[0];

    // Check if user is admin
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    // Attach user with verified admin role
    req.user.role = user.role;
    next();
  } catch (error) {
    console.error('Admin authorization error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Authorization check failed',
    });
  }
}

module.exports = { authorizeAdmin };
