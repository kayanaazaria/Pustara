const cron   = require('node-cron');
const axios  = require('axios');
const { Redis } = require('@upstash/redis'); 
// Import isNeon to make queries compatible with both Neon and Azure
const { executeQuery, isNeon } = require('../config/database');   

const FASTAPI_URL = process.env.FASTAPI_URL;
const HF_TOKEN    = process.env.HF_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET || process.env.RI_SECRET; // Fallback just in case

// Helper log
function log(job, msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
  console.log(`[CRON ${ts}] [${job}] ${msg}`);
}

// Initialize Redis Upstash
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const STREAM_CURSOR_KEY = 'sync:activity_stream:last_id';

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
    log('SYNC', `⚠️ ensureUserFromFirebaseUid failed for ${firebaseUid}: ${e.message}`);
    return null;
  }
}

function coerceArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.result)) return raw.result;
  if (Array.isArray(raw.entries)) return raw.entries;
  if (Array.isArray(raw.messages)) return raw.messages;
  if (Array.isArray(raw.data)) return raw.data;

  // Upstash xrange can return object map: { "<id>": { ...fields } }
  if (typeof raw === 'object') {
    const mapped = Object.entries(raw)
      .filter(([id, fields]) => typeof id === 'string' && fields && typeof fields === 'object')
      .map(([id, fields]) => [id, fields]);
    if (mapped.length > 0) return mapped;
  }

  return [];
}

function normalizeActivityRecord(record) {
  if (!record) return null;

  if (typeof record === 'string') {
    const parts = String(record).split(':');
    if (parts.length < 3) return null;
    const action = parts.pop();
    const bookRef = parts.pop();
    const userRef = parts.join(':');
    return { userRef, bookRef, action };
  }

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

  if (record && typeof record === 'object') {
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
    log('SYNC', `⚠️ resolveUserDbId failed for ${key}: ${e.message}`);
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
    log('SYNC', `⚠️ resolveBookDbId failed for ${key}: ${e.message}`);
  }

  BOOK_ID_CACHE.set(key, null);
  return null;
}

// ─────────────────────────────────────────────────────────────
// Job 1: Rebuild AI Models — 03:00 WIB
// ─────────────────────────────────────────────────────────────
cron.schedule('0 3 * * *', async () => {
  log('REBUILD', 'Starting AI model rebuild process...');
  try {
    // Changed to GET and moved secret to URL parameters
    const res = await axios.get(
      `${FASTAPI_URL}/reindex?key=${CRON_SECRET}`, 
      { 
        timeout: 300000,
        headers: { 'Authorization': `Bearer ${HF_TOKEN}` } // Access to Private Space
      }
    );
    log('REBUILD', `✅ Success: ${JSON.stringify(res.data)}`);
  } catch (err) {
    log('REBUILD', `❌ Error: ${err.message}`);
  }
}, { timezone: 'Asia/Jakarta' });

// ─────────────────────────────────────────────────────────────
// Job 2: Refresh Trending — Every 6 hours
// ─────────────────────────────────────────────────────────────
cron.schedule('0 */6 * * *', async () => {
  log('TRENDING', 'Refreshing trending books...');
  try {
    const res = await axios.get(`${FASTAPI_URL}/recommendations/trending?top_n=50`, {
      headers: { 'Authorization': `Bearer ${HF_TOKEN}` }
    });
    log('TRENDING', `✅ ${res.data.recommendations?.length || 0} trending books updated`);
  } catch (err) {
    log('TRENDING', `❌ Error: ${err.message}`);
  }
}, { timezone: 'Asia/Jakarta' });

// ─────────────────────────────────────────────────────────────
// Job 3: Sync Redis activity → Neon/Azure — every 6 hours
// ─────────────────────────────────────────────────────────────
cron.schedule('0 */6 * * *', async () => {
  log('SYNC', 'Synchronize Redis scores to Database...');
  try {
    let activities = [];
    const keyType = await redis.type('activity:stream');
    let streamLastSeenId = null;
    if (keyType === 'list') {
      activities = coerceArray(await redis.lrange('activity:stream', 0, -1));
    } else if (keyType === 'stream') {
      activities = coerceArray(await redis.xrange('activity:stream', '-', '+'));
      const cursorBefore = await redis.get(STREAM_CURSOR_KEY);
      if (cursorBefore) {
        activities = activities.filter((entry) => {
          const streamId = Array.isArray(entry) ? entry[0] : entry?.id;
          if (!streamId) return false;
          return compareStreamIds(streamId, cursorBefore) > 0;
        });
      }
    }

    log('SYNC', `Found ${activities.length} activity records in stream`);

    if (!activities || activities.length === 0) {
      return;
    }

    let synced = 0;
    let skipped = 0;
    let hasError = false;
    // Set time function based on DB type
    const timeFunc = isNeon ? 'NOW()' : 'GETDATE()';

    const ACTION_WEIGHTS = { view: 1, read: 3, like: 5, bookmark: 4, wishlist: 4, share: 2, review: 8, search_intent: 1 };

    for (const raw of activities) {
      const normalized = normalizeActivityRecord(raw);
      if (!normalized || !normalized.userRef || !normalized.bookRef || !normalized.action) {
        skipped++;
        continue;
      }

      if (keyType === 'stream' && normalized.streamId) {
        if (!streamLastSeenId || compareStreamIds(normalized.streamId, streamLastSeenId) > 0) {
          streamLastSeenId = normalized.streamId;
        }
      }

      const action = String(normalized.action);
      const bookRef = String(normalized.bookRef);
      const userRef = String(normalized.userRef);
      const score = ACTION_WEIGHTS[action] || 1;

      const userId = await resolveUserDbId(userRef);
      const bookId = await resolveBookDbId(bookRef);

      if (!userId || !bookId) {
        skipped++;
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
        synced++;
      } catch (dbErr) {
        skipped++;
        hasError = true;
      }
    }

    if (keyType === 'stream' && streamLastSeenId && !hasError) {
      await redis.set(STREAM_CURSOR_KEY, streamLastSeenId);
    }

    if (keyType === 'list' && synced > 0 && skipped === 0) {
      await redis.del('activity:stream');
    }

    log('SYNC', `✅ Successfully synced ${synced} records to the Database, skipped ${skipped}`);
  } catch (err) {
    log('SYNC', `❌ Synchronization failed: ${err.message}`);
  }
}, { timezone: 'Asia/Jakarta' });

// ─────────────────────────────────────────────────────────────
// Job 4: Overdue Loan Check — every hour (to be implemented)
// ─────────────────────────────────────────────────────────────
/*
cron.schedule('0 * * * *', async () => {
  log('LOANS', 'Checking overdue loans...');
  const timeFunc = isNeon ? 'NOW()' : 'GETDATE()';
  try {
    const updated = await executeQuery(`
      UPDATE loans SET status = 'overdue'
      WHERE status = 'active' AND due_at < ${timeFunc}
    `);
    if (updated.length > 0) log('LOANS', `⚠️ ${updated.length} loan marked overdue`);
  } catch (err) {
    log('LOANS', `❌ Error: ${err.message}`);
  }
}, { timezone: 'Asia/Jakarta' });
*/

log('INIT', '🚀 All Pustara Cron Job systems are active!');

module.exports = {};