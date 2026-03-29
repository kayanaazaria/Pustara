/**
 * Shelf Controller
 * Handles user shelf data: loans, reading sessions, wishlist, history
 */

const db = require('../config/database');
const UserService = require('../services/userService');

function toRows(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result && Array.isArray(result.recordset)) return result.recordset;
  return [];
}

function parseStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch (_) {
      // fallback to comma split
    }

    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function formatBook(row) {
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    authors: parseStringArray(row.authors),
    genres: parseStringArray(row.genres),
    cover_url: row.cover_url ? String(row.cover_url) : '',
    avg_rating: Number(row.avg_rating || 0),
    year: Number(row.year || 0),
    pages: Number(row.pages || 0),
  };
}

async function resolveActorUserId(req) {
  if (!req.user?.uid) return null;

  const actor = await UserService.getUserByUid(req.user.uid);
  if (!actor.success || !actor.data?.id) return null;

  return String(actor.data.id);
}

async function getActiveLoan(userId, bookId) {
  const rows = toRows(
    await db.executeQuery(
      `SELECT id, borrowed_at, due_date, returned_at
       FROM loans
       WHERE user_id = $1 AND book_id = $2 AND returned_at IS NULL
       ORDER BY borrowed_at DESC
       LIMIT 1`,
      [userId, bookId]
    )
  );
  return rows[0] || null;
}

async function getWishlistRow(userId, bookId) {
  try {
    const rows = toRows(
      await db.executeQuery(
        `SELECT user_id, book_id, added_at
         FROM wishlist
         WHERE user_id = $1 AND book_id = $2
         ORDER BY added_at DESC
         LIMIT 1`,
        [userId, bookId]
      )
    );
    return rows[0] || null;
  } catch (_) {
    const rows = toRows(
      await db.executeQuery(
        `SELECT user_id, book_id, created_at AS added_at
         FROM wishlist
         WHERE user_id = $1 AND book_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, bookId]
      )
    );
    return rows[0] || null;
  }
}

async function getWishlistRowsByUser(userId) {
  try {
    return toRows(
      await db.executeQuery(
        `SELECT b.id, b.title, b.authors, b.genres, b.cover_url, b.avg_rating, b.year, b.pages,
                w.book_id as wishlist_id, w.added_at
         FROM wishlist w
         JOIN books b ON b.id = w.book_id
         WHERE w.user_id = $1
           AND b.is_active = true
         ORDER BY w.added_at DESC`,
        [userId]
      )
    );
  } catch (_) {
    return toRows(
      await db.executeQuery(
        `SELECT b.id, b.title, b.authors, b.genres, b.cover_url, b.avg_rating, b.year, b.pages,
                w.book_id as wishlist_id, w.created_at AS added_at
         FROM wishlist w
         JOIN books b ON b.id = w.book_id
         WHERE w.user_id = $1
           AND b.is_active = true
         ORDER BY w.created_at DESC`,
        [userId]
      )
    );
  }
}

async function ensureReadingSession(userId, bookId) {
  const existingRows = toRows(
    await db.executeQuery(
      `SELECT id
       FROM reading_sessions
       WHERE user_id = $1 AND book_id = $2 AND status IN ('reading', 'active')
       ORDER BY started_at DESC
       LIMIT 1`,
      [userId, bookId]
    )
  );

  if (existingRows.length > 0) return existingRows[0];

  const bookRows = toRows(
    await db.executeQuery(
      'SELECT pages FROM books WHERE id = $1 AND is_active = true LIMIT 1',
      [bookId]
    )
  );
  const totalPages = Number(bookRows[0]?.pages || 0);

  const createdRows = toRows(
    await db.executeQuery(
      `INSERT INTO reading_sessions
       (user_id, book_id, current_page, total_pages, progress_percentage, status, started_at, last_read_at)
       VALUES ($1, $2, 0, $3, 0, 'reading', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, started_at`,
      [userId, bookId, totalPages]
    )
  );

  return createdRows[0] || null;
}

/**
 * GET /shelf/me/status/:bookId
 * Returns interaction flags for one book.
 */
exports.getMyBookStatus = async (req, res) => {
  try {
    const actorUserId = await resolveActorUserId(req);
    if (!actorUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { bookId } = req.params;
    const [loan, wishlist] = await Promise.all([
      getActiveLoan(actorUserId, bookId),
      getWishlistRow(actorUserId, bookId),
    ]);

    res.json({
      success: true,
      data: {
        borrowed: Boolean(loan),
        wishlisted: Boolean(wishlist),
        loan_id: loan ? String(loan.id) : null,
        wishlist_id: wishlist ? String(wishlist.book_id || bookId) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching book shelf status:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch book status', error: error.message });
  }
};

/**
 * POST /shelf/me/borrow/:bookId
 * Create active loan and reading session.
 */
exports.borrowBook = async (req, res) => {
  try {
    const actorUserId = await resolveActorUserId(req);
    if (!actorUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { bookId } = req.params;
    const bookRows = toRows(
      await db.executeQuery(
        'SELECT id, title, available, is_active FROM books WHERE id = $1 LIMIT 1',
        [bookId]
      )
    );

    if (bookRows.length === 0 || !bookRows[0].is_active) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const book = bookRows[0];
    const available = Number(book.available || 0);

    const existingLoan = await getActiveLoan(actorUserId, bookId);
    if (existingLoan) {
      await ensureReadingSession(actorUserId, bookId);
      return res.json({
        success: true,
        message: 'Book already borrowed',
        data: {
          loan_id: String(existingLoan.id),
          borrowed: true,
          due_date: existingLoan.due_date || null,
        },
      });
    }

    if (available <= 0) {
      return res.status(409).json({ success: false, message: 'Book is not available right now' });
    }

    const dueDateRows = toRows(await db.executeQuery("SELECT CURRENT_TIMESTAMP + INTERVAL '7 days' AS due_date"));
    const dueDate = dueDateRows[0]?.due_date || null;

    const loanRows = toRows(
      await db.executeQuery(
        `INSERT INTO loans (user_id, book_id, borrowed_at, due_date, returned_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3, NULL)
         RETURNING id, borrowed_at, due_date`,
        [actorUserId, bookId, dueDate]
      )
    );

    await db.executeQuery(
      'UPDATE books SET available = GREATEST(COALESCE(available, 0) - 1, 0) WHERE id = $1',
      [bookId]
    );

    await ensureReadingSession(actorUserId, bookId);

    const loan = loanRows[0] || {};
    res.status(201).json({
      success: true,
      message: 'Book borrowed successfully',
      data: {
        loan_id: loan.id ? String(loan.id) : null,
        borrowed: true,
        borrowed_at: loan.borrowed_at || null,
        due_date: loan.due_date || dueDate,
      },
    });
  } catch (error) {
    console.error('Error borrowing book:', error.message);
    res.status(500).json({ success: false, message: 'Failed to borrow book', error: error.message });
  }
};

/**
 * POST /shelf/me/return/:bookId
 * Close active loan and restore one available stock.
 */
exports.returnBook = async (req, res) => {
  try {
    const actorUserId = await resolveActorUserId(req);
    if (!actorUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { bookId } = req.params;
    const activeLoan = await getActiveLoan(actorUserId, bookId);

    if (!activeLoan) {
      return res.json({
        success: true,
        message: 'No active loan found for this book',
        data: { borrowed: false, returned: true },
      });
    }

    await db.executeQuery(
      `UPDATE loans
       SET returned_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND returned_at IS NULL`,
      [activeLoan.id, actorUserId]
    );

    await db.executeQuery(
      'UPDATE books SET available = COALESCE(available, 0) + 1 WHERE id = $1',
      [bookId]
    );

    // Pause active reading sessions for this title after the loan is returned.
    await db.executeQuery(
      `UPDATE reading_sessions
       SET status = 'paused'
       WHERE user_id = $1 AND book_id = $2 AND status IN ('reading', 'active')`,
      [actorUserId, bookId]
    );

    res.json({
      success: true,
      message: 'Book returned successfully',
      data: {
        loan_id: String(activeLoan.id),
        borrowed: false,
        returned: true,
      },
    });
  } catch (error) {
    console.error('Error returning book:', error.message);
    res.status(500).json({ success: false, message: 'Failed to return book', error: error.message });
  }
};

/**
 * POST /shelf/me/wishlist/:bookId
 * Add one book to wishlist.
 */
exports.addToWishlist = async (req, res) => {
  try {
    const actorUserId = await resolveActorUserId(req);
    if (!actorUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { bookId } = req.params;
    const existing = await getWishlistRow(actorUserId, bookId);
    if (existing) {
      return res.json({
        success: true,
        message: 'Book already in wishlist',
        data: { wishlist_id: String(existing.book_id || bookId), wishlisted: true },
      });
    }

    let rows = [];
    try {
      rows = toRows(
        await db.executeQuery(
          `INSERT INTO wishlist (user_id, book_id, added_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           RETURNING book_id, added_at`,
          [actorUserId, bookId]
        )
      );
    } catch (_) {
      rows = toRows(
        await db.executeQuery(
          `INSERT INTO wishlist (user_id, book_id, created_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           RETURNING book_id, created_at AS added_at`,
          [actorUserId, bookId]
        )
      );
    }

    res.status(201).json({
      success: true,
      message: 'Book saved to wishlist',
      data: {
        wishlist_id: rows[0]?.book_id ? String(rows[0].book_id) : String(bookId),
        wishlisted: true,
      },
    });
  } catch (error) {
    console.error('Error adding wishlist:', error.message);
    res.status(500).json({ success: false, message: 'Failed to add wishlist', error: error.message });
  }
};

/**
 * DELETE /shelf/me/wishlist/:bookId
 * Remove one book from wishlist.
 */
exports.removeFromWishlist = async (req, res) => {
  try {
    const actorUserId = await resolveActorUserId(req);
    if (!actorUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { bookId } = req.params;
    await db.executeQuery('DELETE FROM wishlist WHERE user_id = $1 AND book_id = $2', [actorUserId, bookId]);

    res.json({
      success: true,
      message: 'Book removed from wishlist',
      data: { wishlisted: false },
    });
  } catch (error) {
    console.error('Error removing wishlist:', error.message);
    res.status(500).json({ success: false, message: 'Failed to remove wishlist', error: error.message });
  }
};

/**
 * GET /shelf/me
 * Returns comprehensive shelf data:
 * - pinjaman (borrowed/active loans)
 * - dibaca (currently reading sessions)
 * - riwayat (finished reading sessions)
 * - wishlist (liked books)
 */
exports.getMyShelf = async (req, res) => {
  try {
    const actorUserId = await resolveActorUserId(req);
    if (!actorUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Query all shelf data in parallel
    const [
      borrowedRows,
      readingNowRows,
      finishedRows,
      wishlistRows,
    ] = await Promise.all([
      // Active loans (status: 'borrowed' or 'active')
      toRows(
        await db.executeQuery(
          `SELECT b.id, b.title, b.authors, b.genres, b.cover_url, b.avg_rating, b.year, b.pages,
                  l.id as loan_id, l.borrowed_at, l.due_date, l.returned_at
           FROM loans l
           JOIN books b ON b.id = l.book_id
           WHERE l.user_id = $1
             AND b.is_active = true
             AND l.returned_at IS NULL
           ORDER BY l.borrowed_at DESC`,
          [actorUserId]
        )
      ),
      // Currently reading sessions
      toRows(
        await db.executeQuery(
          `SELECT b.id, b.title, b.authors, b.genres, b.cover_url, b.avg_rating, b.year, b.pages,
                  rs.id as session_id, rs.current_page, rs.total_pages, 
                  rs.progress_percentage, rs.last_read_at, rs.started_at
           FROM reading_sessions rs
           JOIN books b ON b.id = rs.book_id
           WHERE rs.user_id = $1
             AND b.is_active = true
             AND rs.status IN ('reading', 'active')
           ORDER BY rs.last_read_at DESC`,
          [actorUserId]
        )
      ),
      // Finished reading sessions
      toRows(
        await db.executeQuery(
          `SELECT b.id, b.title, b.authors, b.genres, b.cover_url, b.avg_rating, b.year, b.pages,
                  rs.id as session_id, rs.current_page, rs.total_pages, 
                  rs.progress_percentage, rs.finished_at, rs.started_at, rs.reading_time_minutes
           FROM reading_sessions rs
           JOIN books b ON b.id = rs.book_id
           WHERE rs.user_id = $1
             AND b.is_active = true
             AND rs.status = 'finished'
           ORDER BY rs.finished_at DESC`,
          [actorUserId]
        )
      ),
      // Wishlist / liked books
      getWishlistRowsByUser(actorUserId),
    ]);

    // Format pinjaman (borrowed books)
    const pinjaman = borrowedRows.map((row) => ({
      ...formatBook(row),
      loan_id: String(row.loan_id || ''),
      borrowed_at: row.borrowed_at || null,
      due_date: row.due_date || null,
      returned_at: row.returned_at || null,
      // Calculate days left
      days_left: row.due_date
        ? Math.max(
            0,
            Math.floor((new Date(row.due_date) - new Date()) / (1000 * 60 * 60 * 24))
          )
        : null,
    }));

    // Format dibaca (currently reading)
    const dibaca = readingNowRows.map((row) => ({
      ...formatBook(row),
      session_id: String(row.session_id || ''),
      current_page: Number(row.current_page || 0),
      total_pages: Number(row.total_pages || 0),
      progress_percentage: Number(row.progress_percentage || 0),
      last_read_at: row.last_read_at || null,
      started_at: row.started_at || null,
    }));

    // Format riwayat (finished reading)
    const riwayat = finishedRows.map((row) => ({
      ...formatBook(row),
      session_id: String(row.session_id || ''),
      finished_at: row.finished_at || null,
      started_at: row.started_at || null,
      reading_time_minutes: Number(row.reading_time_minutes || 0),
      // Calculate days read
      days_read: row.started_at && row.finished_at
        ? Math.max(
            1,
            Math.floor((new Date(row.finished_at) - new Date(row.started_at)) / (1000 * 60 * 60 * 24))
          )
        : null,
    }));

    // Format wishlist
    const wishlist = wishlistRows.map((row) => ({
      ...formatBook(row),
      wishlist_id: String(row.wishlist_id || ''),
      added_at: row.added_at || null,
    }));

    res.json({
      success: true,
      data: {
        pinjaman,
        dibaca,
        riwayat,
        wishlist,
      },
    });
  } catch (error) {
    console.error('Error fetching shelf data:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shelf data',
      error: error.message,
    });
  }
};
