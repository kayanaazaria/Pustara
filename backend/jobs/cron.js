const cron   = require('node-cron');
const axios  = require('axios');
const { Redis } = require('@upstash/redis'); 
// Import isDummy to make queries compatible with both Neon and Azure
const { executeQuery, isDummy } = require('../config/database');   

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
// Job 3: Sync Redis scores → Neon/Azure — 02:00 WIB
// ─────────────────────────────────────────────────────────────
cron.schedule('0 2 * * *', async () => {
  log('SYNC', 'Synchronize Redis scores to Database...');
  try {
    // Get all the user's score keys
    const keys = await redis.keys('user:scores:*');
    log('SYNC', `Found ${keys.length} user score data`);

    let synced = 0;
    // Set time function based on DB type
    const timeFunc = isDummy ? 'NOW()' : 'GETDATE()';

    for (const key of keys) {
      const userId = key.replace('user:scores:', '');
      const scores = await redis.hgetall(key);

      for (const [bookId, scoreStr] of Object.entries(scores)) {
        const score = parseFloat(scoreStr);
        if (isNaN(score) || score <= 0) continue;

        try {
          // Manual check to support both Azure SQL and Neon safely
          const existing = await executeQuery(
            `SELECT score FROM user_book_scores WHERE user_id = $1 AND book_id = $2`, 
            [userId, bookId]
          );

          if (existing.length > 0) {
            // Update if exists
            await executeQuery(
              `UPDATE user_book_scores 
               SET score = score + $3, updated_at = ${timeFunc} 
               WHERE user_id = $1 AND book_id = $2`, 
              [userId, bookId, score]
            );
          } else {
            // Insert if not exists
            await executeQuery(
              `INSERT INTO user_book_scores (user_id, book_id, score, updated_at) 
               VALUES ($1, $2, $3, ${timeFunc})`, 
              [userId, bookId, score]
            );
          }
          synced++;
        } catch (dbErr) {
          // Ignore UUID errors (usually dummy users)
        }
      }
    }
    log('SYNC', `✅ Successfully synced ${synced} records to the Database`);
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
  const timeFunc = isDummy ? 'NOW()' : 'GETDATE()';
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