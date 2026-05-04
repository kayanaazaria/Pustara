const express = require('express');
const { Redis } = require('@upstash/redis');
const { executeQuery, isNeon } = require('../config/database');

const router = express.Router();

// Initialize Redis safely with fallback
let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('⚠️  [cronRoutes] Redis credentials missing - Redis features disabled');
  } else {
    redis = new Redis({ url, token });
    console.log('✅ [cronRoutes] Redis initialized successfully');
  }
} catch (err) {
  console.error('❌ [cronRoutes] Redis initialization failed:', err.message);
  redis = null;
}

const STREAM_CURSOR_KEY = 'sync:activity_stream:last_id';

const ACTION_WEIGHTS = { view: 1, read: 3, like: 5, wishlist: 4, bookmark: 4, share: 2, review: 8, search_intent: 1 };
const USER_ID_CACHE = new Map();
const BOOK_ID_CACHE = new Map();

function makeSyntheticIdentity(firebaseUid) {
  const raw = String(firebaseUid || '').trim();
  const safe = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const base = (safe || 'user').slice(0, 24);
  const username = `u_${base}`;
  const email = `${base}@firebase.local`;
  return { username, email };
}

async function ensureUserFromFirebaseUid(firebaseUid) {
  if (!isNeon || !firebaseUid) return null;
  const { username, email } = makeSyntheticIdentity(firebaseUid);

  try {
    const created = await executeQuery(
      `INSERT INTO users (firebase_uid, username, display_name, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (firebase_uid) DO UPDATE SET updated_at = NOW()
       RETURNING id::text AS id`,
      [String(firebaseUid), username, username, email]
    );
    return created[0]?.id || null;
  } catch (e) {
    console.error(`[CRON] ensureUserFromFirebaseUid failed for ${firebaseUid}:`, e.message);
    return null;
  }
}

async function resolveUserDbId(userRef) {
  if (!userRef) return null;
  const key = String(userRef).trim();
  if (USER_ID_CACHE.has(key)) return USER_ID_CACHE.get(key);

  try {
    const byId = await executeQuery('SELECT id::text AS id FROM users WHERE id::text = $1 LIMIT 1', [key]);
    if (byId.length > 0) {
      USER_ID_CACHE.set(key, byId[0].id);
      return byId[0].id;
    }

    const byFirebase = await executeQuery('SELECT id::text AS id FROM users WHERE firebase_uid = $1 LIMIT 1', [key]);
    if (byFirebase.length > 0) {
      USER_ID_CACHE.set(key, byFirebase[0].id);
      return byFirebase[0].id;
    }

    const autoCreated = await ensureUserFromFirebaseUid(key);
    if (autoCreated) {
      USER_ID_CACHE.set(key, autoCreated);
      return autoCreated;
    }
  } catch (e) {
    console.error(`[CRON] resolveUserDbId failed for ${key}:`, e.message);
  }

  USER_ID_CACHE.set(key, null);
  return null;
}

async function resolveBookDbId(bookRef) {
  if (!bookRef) return null;
  const key = String(bookRef).trim();
  if (BOOK_ID_CACHE.has(key)) return BOOK_ID_CACHE.get(key);

  const normalizedSlug = key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  try {
    const byId = await executeQuery('SELECT id::text AS id FROM books WHERE id::text = $1 LIMIT 1', [key]);
    if (byId.length > 0) {
      BOOK_ID_CACHE.set(key, byId[0].id);
      return byId[0].id;
    }

    const byExternal = await executeQuery('SELECT id::text AS id FROM books WHERE lower(external_key) = lower($1) LIMIT 1', [key]);
    if (byExternal.length > 0) {
      BOOK_ID_CACHE.set(key, byExternal[0].id);
      return byExternal[0].id;
    }

    if (normalizedSlug && normalizedSlug !== key.toLowerCase()) {
      const bySlug = await executeQuery('SELECT id::text AS id FROM books WHERE lower(external_key) = lower($1) LIMIT 1', [normalizedSlug]);
      if (bySlug.length > 0) {
        BOOK_ID_CACHE.set(key, bySlug[0].id);
        return bySlug[0].id;
      }
    }

    const byTitle = await executeQuery('SELECT id::text AS id FROM books WHERE lower(title) = lower($1) LIMIT 1', [key]);
    if (byTitle.length > 0) {
      BOOK_ID_CACHE.set(key, byTitle[0].id);
      return byTitle[0].id;
    }
  } catch (e) {
    console.error(`[CRON] resolveBookDbId failed for ${key}:`, e.message);
  }

  BOOK_ID_CACHE.set(key, null);
  return null;
}

function normalizeActivityRecord(record) {
  // list mode: "userId:bookId:action"
  if (typeof record === 'string') {
    if (record.startsWith('{')) {
      try {
        const obj = JSON.parse(record);
        return {
          userRef: obj.user_id || obj.userId,
          bookRef: obj.book_id || obj.bookId,
          action: obj.action,
        };
      } catch {
        return null;
      }
    }

    const parts = record.split(':');
    if (parts.length < 3) return null;
    const action = parts.pop();
    const bookRef = parts.pop();
    const userRef = parts.join(':');
    return { userRef, bookRef, action };
  }

  // stream mode (xrange): [id, fields]
  if (Array.isArray(record) && record.length >= 2) {
    const streamId = record[0] ? String(record[0]) : null;
    const fields = record[1] || {};
    return {
      streamId,
      userRef: fields.user_id || fields.userId,
      bookRef: fields.book_id || fields.bookId,
      action: fields.action,
    };
  }

  // plain object mode
  if (record && typeof record === 'object') {
    // stream entry object mode: { id, fields: {...} }
    if (record.fields && typeof record.fields === 'object') {
      return {
        streamId: record.id ? String(record.id) : null,
        userRef: record.fields.user_id || record.fields.userId,
        bookRef: record.fields.book_id || record.fields.bookId,
        action: record.fields.action,
      };
    }

    return {
      userRef: record.user_id || record.userId || record.userRef,
      bookRef: record.book_id || record.bookId || record.bookRef,
      action: record.action,
    };
  }

  return null;
}

function parseStreamId(id) {
  const raw = String(id || '');
  const [msStr, seqStr = '0'] = raw.split('-');
  try {
    return { ms: BigInt(msStr), seq: BigInt(seqStr) };
  } catch {
    return null;
  }
}

function compareStreamIds(a, b) {
  const pa = parseStreamId(a);
  const pb = parseStreamId(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.ms < pb.ms) return -1;
  if (pa.ms > pb.ms) return 1;
  if (pa.seq < pb.seq) return -1;
  if (pa.seq > pb.seq) return 1;
  return 0;
}

function coerceActivities(rawResult) {
  if (!rawResult) return [];
  if (Array.isArray(rawResult)) return rawResult;

  // Common wrappers from SDK/REST adapters
  if (Array.isArray(rawResult.result)) return rawResult.result;
  if (Array.isArray(rawResult.messages)) return rawResult.messages;
  if (Array.isArray(rawResult.entries)) return rawResult.entries;
  if (Array.isArray(rawResult.data)) return rawResult.data;

  // Upstash xrange can return object map: { "<id>": { ...fields } }
  if (typeof rawResult === 'object') {
    const mapped = Object.entries(rawResult)
      .filter(([id, fields]) => typeof id === 'string' && fields && typeof fields === 'object')
      .map(([id, fields]) => [id, fields]);
    if (mapped.length > 0) return mapped;
  }

  return [];
}

async function buildActivitiesFromRecentCache(redisClient) {
  try {
    const keys = await redisClient.keys('user:recent:*');
    const recentKeys = Array.isArray(keys) ? keys : [];
    const synthesized = [];

    for (const key of recentKeys) {
      const userRef = String(key).replace(/^user:recent:/, '');
      const books = coerceActivities(await redisClient.lrange(key, 0, 49));
      for (const bookRef of books) {
        synthesized.push({
          userRef,
          bookRef: String(bookRef),
          action: 'view',
        });
      }
    }

    return synthesized;
  } catch (err) {
    console.error('[CRON] buildActivitiesFromRecentCache failed:', err.message);
    return [];
  }
}

router.get('/sync', async (req, res) => {
  const secretKey = req.query.key || req.headers.authorization;
  if (secretKey !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, message: 'Hayo mau ngapain? 🤨' });
  }

  console.log(`🔄 [CRON] Starting Redis to DB sync... (Target DB: ${isNeon ? 'Neon/Postgres' : 'Azure/SQL Server'})`);
  const timeFunc = isNeon ? 'NOW()' : 'GETDATE()';
  let syncedCount = 0;
  let skippedCount = 0;
  let skippedInvalid = 0;
  let skippedUser = 0;
  let skippedBook = 0;
  const unresolvedUsers = new Set();
  const unresolvedBooks = new Set();
  let hasError = false; // Flag data loss 
  let source = 'activity:stream';
  let streamCursorBefore = null;
  let streamCursorAfter = null;
  let streamLastSeenId = null;

  try {
    const keyType = await redis.type('activity:stream');
    let activities = [];

    if (keyType === 'list') {
      activities = coerceActivities(await redis.lrange('activity:stream', 0, -1));
    } else if (keyType === 'stream') {
      // Upstash SDK returns entries as [id, fields]
      activities = coerceActivities(await redis.xrange('activity:stream', '-', '+'));
      streamCursorBefore = await redis.get(STREAM_CURSOR_KEY);
      if (streamCursorBefore) {
        activities = activities.filter((entry) => {
          const streamId = Array.isArray(entry) ? entry[0] : entry?.id;
          if (!streamId) return false;
          return compareStreamIds(streamId, streamCursorBefore) > 0;
        });
      }
    } else if (keyType === 'none') {
      return res.status(200).json({ success: true, message: 'No new activities to sync.', synced_rows: 0 });
    } else {
      return res.status(200).json({
        success: false,
        message: `Unsupported activity:stream type: ${keyType}`,
        synced_rows: 0,
      });
    }

    if (!activities || activities.length === 0) {
      const allowFallback = req.query.fallback === '1';
      if (!allowFallback) {
        return res.status(200).json({
          success: true,
          message: 'No new activities in stream. Set fallback=1 to backfill from user:recent:*',
          synced_rows: 0,
          source: 'none',
        });
      }

      const fallbackActivities = await buildActivitiesFromRecentCache(redis);
      if (!fallbackActivities.length) {
        return res.status(200).json({ success: true, message: 'No fallback activities to sync.', synced_rows: 0, source: 'none' });
      }
      activities = fallbackActivities;
      source = 'user:recent:*';
    }

    for (const raw of activities) {
      const normalized = normalizeActivityRecord(raw);
      if (!normalized || !normalized.userRef || !normalized.bookRef || !normalized.action) {
        skippedCount++;
        skippedInvalid++;
        continue;
      }

      if (keyType === 'stream' && normalized.streamId) {
        if (!streamLastSeenId || compareStreamIds(normalized.streamId, streamLastSeenId) > 0) {
          streamLastSeenId = normalized.streamId;
        }
      }

      const userId = await resolveUserDbId(normalized.userRef);
      const bookId = await resolveBookDbId(normalized.bookRef);
      const action = String(normalized.action);
      const score = ACTION_WEIGHTS[action] || 1;

      if (!userId || !bookId) {
        skippedCount++;
        if (!userId) {
          skippedUser++;
          unresolvedUsers.add(String(normalized.userRef));
        }
        if (!bookId) {
          skippedBook++;
          unresolvedBooks.add(String(normalized.bookRef));
        }
        continue;
      }

      const viewInc = action === 'view' ? 1 : 0;
      const readInc = action === 'read' ? 1 : 0;
      const likeInc = action === 'like' ? 1 : 0;
      const bookmarkInc = action === 'bookmark' || action === 'wishlist' ? 1 : 0;
      const shareInc = action === 'share' ? 1 : 0;
      const reviewInc = action === 'review' ? 1 : 0;

      try {
        await executeQuery(
          `INSERT INTO user_book_scores
              (user_id, book_id, score, views, reads, likes, bookmarks, shares, review_cnt, updated_at)
           VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${timeFunc})
           ON CONFLICT (user_id, book_id) DO UPDATE
           SET
             score = user_book_scores.score + EXCLUDED.score,
             views = COALESCE(user_book_scores.views, 0) + EXCLUDED.views,
             reads = COALESCE(user_book_scores.reads, 0) + EXCLUDED.reads,
             likes = COALESCE(user_book_scores.likes, 0) + EXCLUDED.likes,
             bookmarks = COALESCE(user_book_scores.bookmarks, 0) + EXCLUDED.bookmarks,
             shares = COALESCE(user_book_scores.shares, 0) + EXCLUDED.shares,
             review_cnt = COALESCE(user_book_scores.review_cnt, 0) + EXCLUDED.review_cnt,
             updated_at = ${timeFunc}`,
          [userId, bookId, score, viewInc, readInc, likeInc, bookmarkInc, shareInc, reviewInc]
        );
        syncedCount++;
      } catch (dbErr) {
        console.error(`⚠️ [CRON] Error syncing ${JSON.stringify(normalized)}:`, dbErr.message);
        hasError = true; // flag error to stop processing further entries and prevent stream cleanup
      }
    }

    const shouldClear = req.query.clear === '1';
    if (keyType === 'stream' && streamLastSeenId && !hasError) {
      await redis.set(STREAM_CURSOR_KEY, streamLastSeenId);
      streamCursorAfter = streamLastSeenId;
    }

    if (shouldClear && activities.length > 0 && !hasError && keyType === 'list') {
      await redis.del('activity:stream');
      console.log(`✅ [CRON] Sync beres! ${syncedCount} baris masuk ke DB. Stream list dibersihkan.`);
    } else if (hasError || skippedCount > 0) {
      console.log(`⚠️ [CRON] Sync selesai parsial. Stream TIDAK dihapus untuk mencegah data loss.`);
    }

    return res.status(200).json({ 
      success: !hasError,
      message: hasError ? 'Sync finished with some DB errors.' : 'Sync Redis to DB processed.',
      synced_rows: syncedCount,
      skipped_rows: skippedCount,
      skipped_invalid: skippedInvalid,
      skipped_user_unresolved: skippedUser,
      skipped_book_unresolved: skippedBook,
      unresolved_users_sample: Array.from(unresolvedUsers).slice(0, 5),
      unresolved_books_sample: Array.from(unresolvedBooks).slice(0, 5),
      stream_type: keyType,
      source,
      cleared: shouldClear && !hasError && keyType === 'list',
      stream_cursor_before: streamCursorBefore,
      stream_cursor_after: streamCursorAfter,
      db_target: isNeon ? 'Neon' : 'Azure SQL'
    });

  } catch (error) {
    console.error('❌ [CRON] Sync Redis to DB error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;