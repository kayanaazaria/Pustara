/**
 * Pustara — Redis Client (Upstash REST SDK)
 */

const { Redis } = require('@upstash/redis');
const { executeQuery, isDummy } = require('../config/database');

let redis = null;

function getRedisClient() {
  if (redis) return redis;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('[Redis] UPSTASH_REDIS_REST_URL/TOKEN not set — Redis features disabled.');
    return null;
  }

  try {
    redis = new Redis({ url, token });
    console.log('[Redis] ✅ Upstash REST client initialized');
    return redis;
  } catch (err) {
    console.error('[Redis] Initialization failed:', err.message);
    return null;
  }
}

const ACTION_WEIGHTS = { view: 1, read: 3, like: 5, bookmark: 4, wishlist: 4, share: 2, review: 8 };
const BOOK_REF_CACHE = new Map();
const ACTIVITY_STREAM_TTL_SECONDS = Number(process.env.REDIS_ACTIVITY_STREAM_TTL_SECONDS || (8 * 24 * 3600));

async function resolveCanonicalBookId(bookRef) {
  if (!bookRef) return null;
  const key = String(bookRef).trim();
  if (!key) return null;
  if (BOOK_REF_CACHE.has(key)) return BOOK_REF_CACHE.get(key);

  try {
    if (isDummy) {
      const byId = await executeQuery('SELECT id::text AS id FROM books WHERE id::text = $1 LIMIT 1', [key]);
      if (byId.length > 0) {
        BOOK_REF_CACHE.set(key, byId[0].id);
        return byId[0].id;
      }

      const byExternal = await executeQuery('SELECT id::text AS id FROM books WHERE lower(external_key) = lower($1) LIMIT 1', [key]);
      if (byExternal.length > 0) {
        BOOK_REF_CACHE.set(key, byExternal[0].id);
        return byExternal[0].id;
      }

      const byTitle = await executeQuery('SELECT id::text AS id FROM books WHERE lower(title) = lower($1) LIMIT 1', [key]);
      if (byTitle.length > 0) {
        BOOK_REF_CACHE.set(key, byTitle[0].id);
        return byTitle[0].id;
      }
    } else {
      const byId = await executeQuery('SELECT CAST(id AS NVARCHAR(255)) AS id FROM books WHERE CAST(id AS NVARCHAR(255)) = $1', [key]);
      if (byId.length > 0) {
        BOOK_REF_CACHE.set(key, byId[0].id);
        return byId[0].id;
      }

      const byTitle = await executeQuery('SELECT TOP 1 CAST(id AS NVARCHAR(255)) AS id FROM books WHERE LOWER(title) = LOWER($1)', [key]);
      if (byTitle.length > 0) {
        BOOK_REF_CACHE.set(key, byTitle[0].id);
        return byTitle[0].id;
      }
    }
  } catch (err) {
    console.warn('[Redis] resolveCanonicalBookId warning:', err.message);
  }

  BOOK_REF_CACHE.set(key, null);
  return null;
}

/**
 * Push user activity to Redis (Stream + Trending + cache invalidation).
 * Called from anywhere in the backend.
 */
async function pushActivity(userId, bookId, action) {
  const r = getRedisClient();
  if (!r) return false;

  const weight = ACTION_WEIGHTS[action] || 1;

  try {
    const canonicalBookId = await resolveCanonicalBookId(bookId);
    const normalizedBookId = String(canonicalBookId || bookId);
    const ts = Date.now();

    // 1. Activity stream — for social signal in FastAPI
    if (typeof r.xadd === 'function') {
      await r.xadd(
        'activity:stream',
        '*',
        {
          user_id: String(userId),
          book_id: normalizedBookId,
          action: String(action),
          ts: String(ts),
        },
        {
          trim: {
            type: 'MAXLEN',
            threshold: 100000,
            comparison: '~',
          },
        }
      );
    } else {
      // Legacy fallback for older clients.
      await r.lpush('activity:stream', `${userId}:${normalizedBookId}:${action}`);
    }
    await r.expire('activity:stream', ACTIVITY_STREAM_TTL_SECONDS);

    // 2. Trending sorted set
    await r.zincrby('trending:books:7d', weight, normalizedBookId);
    await r.expire('trending:books:7d', 8 * 24 * 3600); // 8 hari

    // 3. Save in the per-user recent list (max 50 entries, for AI context)
    const userKey = `user:recent:${userId}`;
    await r.lpush(userKey, normalizedBookId);
    await r.ltrim(userKey, 0, 49); // keep last 50
    await r.expire(userKey, 30 * 24 * 3600); // 30 days

    // 4. Invalidate this user's recommendation cache in FastAPI
    await r.del(`rec:cache:${userId}`);

    return true;
  } catch (err) {
    console.error('[Redis] pushActivity error:', err.message);
    return false;
  }
}

/**
* Alias for bookController.js that calls logBookInteraction.
* Signature is exactly the same as pushActivity.
*/
const logBookInteraction = pushActivity;

/**
* Get the list of book_id that were recently interacted with by the user.
* Used in recommendations.js to send context to FastAPI.
* @returns {string[]} array of book_id strings
*/
async function getUserRecentBooks(userId, limit = 10) {
  const r = getRedisClient();
  if (!r) return [];
  try {
    const items = await r.lrange(`user:recent:${userId}`, 0, limit - 1);
    // Deduplicate while maintaining order
    return [...new Set(items)];
  } catch (err) {
    console.error('[Redis] getUserRecentBooks error:', err.message);
    return [];
  }
}

/**
 * Get trending book_ids from Redis.
 * @returns {{ book_id: string, score: number }[]}
 */
async function getTrending(n = 10) {
  const r = getRedisClient();
  if (!r) return [];

  try {
    const results = await r.zrange('trending:books:7d', 0, n - 1, {
      rev: true,
      withScores: true,
    });

    const trending = [];
    for (let i = 0; i < results.length; i += 2) {
      trending.push({ book_id: results[i], score: results[i + 1] });
    }
    return trending;
  } catch (err) {
    console.error('[Redis] getTrending error:', err.message);
    return [];
  }
}

module.exports = { getRedisClient, pushActivity, logBookInteraction, getUserRecentBooks, getTrending };