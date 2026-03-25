require('dotenv').config();

const { Redis } = require('@upstash/redis');
const { initializeDatabase, executeQuery, closeDatabase } = require('../config/database');

function coerceArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.result)) return raw.result;
  if (Array.isArray(raw?.entries)) return raw.entries;
  if (Array.isArray(raw?.messages)) return raw.messages;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function makeSyntheticIdentity(firebaseUid) {
  const raw = String(firebaseUid || '').trim();
  const safe = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const base = (safe || 'user').slice(0, 24);
  return {
    username: `u_${base}`,
    email: `${base}@firebase.local`,
  };
}

async function resolveUserDbId(userRef) {
  const key = String(userRef || '').trim();
  if (!key) return null;

  let rows = await executeQuery('SELECT id::text AS id FROM users WHERE firebase_uid = $1 LIMIT 1', [key]);
  if (rows[0]?.id) return rows[0].id;

  const synthetic = makeSyntheticIdentity(key);
  rows = await executeQuery(
    `INSERT INTO users (firebase_uid, username, display_name, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (firebase_uid) DO UPDATE SET updated_at = NOW()
     RETURNING id::text AS id`,
    [key, synthetic.username, synthetic.username, synthetic.email]
  );

  return rows[0]?.id || null;
}

async function resolveBookDbId(bookRef) {
  const key = String(bookRef || '').trim();
  if (!key) return null;

  let rows = await executeQuery('SELECT id::text AS id FROM books WHERE id::text = $1 LIMIT 1', [key]);
  if (rows[0]?.id) return rows[0].id;

  rows = await executeQuery('SELECT id::text AS id FROM books WHERE lower(external_key) = lower($1) LIMIT 1', [key]);
  if (rows[0]?.id) return rows[0].id;

  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug) {
    rows = await executeQuery('SELECT id::text AS id FROM books WHERE lower(external_key) = lower($1) LIMIT 1', [slug]);
    if (rows[0]?.id) return rows[0].id;
  }

  rows = await executeQuery('SELECT id::text AS id FROM books WHERE lower(title) = lower($1) LIMIT 1', [key]);
  return rows[0]?.id || null;
}

async function run() {
  await initializeDatabase();

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const keys = coerceArray(await redis.keys('user:recent:*'));
  let synced = 0;
  let skipped = 0;

  for (const key of keys) {
    const userRef = String(key).replace(/^user:recent:/, '');
    const userId = await resolveUserDbId(userRef);
    const books = coerceArray(await redis.lrange(key, 0, 49));

    for (const rawBook of books) {
      const bookId = await resolveBookDbId(rawBook);
      if (!userId || !bookId) {
        skipped++;
        continue;
      }

      await executeQuery(
        `INSERT INTO user_book_scores
           (user_id, book_id, score, views, reads, likes, bookmarks, shares, review_cnt, updated_at)
         VALUES
           ($1, $2, 1, 1, 0, 0, 0, 0, 0, NOW())
         ON CONFLICT (user_id, book_id) DO UPDATE
         SET
           score = user_book_scores.score + 1,
           views = COALESCE(user_book_scores.views, 0) + 1,
           updated_at = NOW()`,
        [userId, bookId]
      );

      synced++;
    }
  }

  const total = await executeQuery('SELECT COUNT(*)::int AS n FROM user_book_scores');
  console.log(JSON.stringify({
    success: true,
    synced,
    skipped,
    user_book_scores_count: total[0]?.n || 0,
    processed_users: keys.length,
  }));
}

run()
  .catch((err) => {
    console.error(JSON.stringify({ success: false, error: err.message }));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closeDatabase();
    } catch (_) {
      // noop
    }
  });
