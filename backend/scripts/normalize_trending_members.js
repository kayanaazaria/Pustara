require('dotenv').config();

const { Redis } = require('@upstash/redis');
const { initializeDatabase, executeQuery, isDummy, closeDatabase } = require('../config/database');

const TRENDING_KEY = 'trending:books:7d';

async function resolveCanonicalBookId(bookRef) {
  const key = String(bookRef || '').trim();
  if (!key) return null;

  if (isDummy) {
    let rows = await executeQuery('SELECT id::text AS id FROM books WHERE id::text = $1 LIMIT 1', [key]);
    if (rows[0]?.id) return rows[0].id;

    rows = await executeQuery('SELECT id::text AS id FROM books WHERE lower(external_key) = lower($1) LIMIT 1', [key]);
    if (rows[0]?.id) return rows[0].id;

    rows = await executeQuery('SELECT id::text AS id FROM books WHERE lower(title) = lower($1) LIMIT 1', [key]);
    if (rows[0]?.id) return rows[0].id;
  } else {
    let rows = await executeQuery('SELECT CAST(id AS NVARCHAR(255)) AS id FROM books WHERE CAST(id AS NVARCHAR(255)) = $1', [key]);
    if (rows[0]?.id) return rows[0].id;

    rows = await executeQuery('SELECT TOP 1 CAST(id AS NVARCHAR(255)) AS id FROM books WHERE LOWER(title) = LOWER($1)', [key]);
    if (rows[0]?.id) return rows[0].id;
  }

  return null;
}

function parseZRangeWithScores(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const pairs = [];
  for (let i = 0; i < arr.length; i += 2) {
    const member = arr[i];
    const score = Number(arr[i + 1]);
    if (member === undefined || !Number.isFinite(score)) continue;
    pairs.push([String(member), score]);
  }
  return pairs;
}

async function run() {
  await initializeDatabase();

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const ttl = await redis.ttl(TRENDING_KEY);
  const raw = await redis.zrange(TRENDING_KEY, 0, 1000, { rev: true, withScores: true });
  const pairs = parseZRangeWithScores(raw);

  const aggregated = new Map();
  let unresolved = 0;

  for (const [member, score] of pairs) {
    const canonical = (await resolveCanonicalBookId(member)) || member;
    if (canonical === member) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(member);
      if (!isUuid) unresolved += 1;
    }
    aggregated.set(canonical, (aggregated.get(canonical) || 0) + score);
  }

  await redis.del(TRENDING_KEY);
  for (const [member, score] of aggregated.entries()) {
    await redis.zincrby(TRENDING_KEY, score, member);
  }

  if (Number.isFinite(ttl) && ttl > 0) {
    await redis.expire(TRENDING_KEY, ttl);
  }

  const after = await redis.zcard(TRENDING_KEY);
  console.log(JSON.stringify({
    success: true,
    before_members: pairs.length,
    after_members: after,
    unresolved_legacy_members: unresolved,
    ttl_restored: Number.isFinite(ttl) && ttl > 0,
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
