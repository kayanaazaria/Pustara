const express = require('express');
const { Redis } = require('@upstash/redis');
const { executeQuery, isDummy } = require('../config/database');

const router = express.Router();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ACTION_WEIGHTS = { view: 1, read: 3, like: 5, bookmark: 4, share: 2, review: 8 };

router.get('/sync', async (req, res) => {
  const secretKey = req.query.key || req.headers.authorization;
  if (secretKey !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, message: 'Hayo mau ngapain? 🤨' });
  }

  console.log('🔄 [CRON] Starting Redis to DB sync...');
  const timeFunc = isDummy ? 'NOW()' : 'GETDATE()';
  let syncedCount = 0;

  try {
    const activities = await redis.zrange('activity:queue', 0, -1);
    
    if (!activities || activities.length === 0) {
      console.log('✅ [CRON] No new activities to sync.');
      return res.status(200).json({ success: true, message: 'No new activities to sync.', synced_rows: 0 });
    }

    for (const actStr of activities) {
      const [userId, bookId, action] = actStr.split(':');
      const score = ACTION_WEIGHTS[action] || 1;

      try {
        let query = '';
        if (isDummy) {
          query = `
            INSERT INTO user_book_scores (user_id, book_id, score, updated_at) 
            VALUES ($1, $2, $3, ${timeFunc})
            ON CONFLICT (user_id, book_id) DO UPDATE 
            SET score = user_book_scores.score + EXCLUDED.score, 
                updated_at = ${timeFunc}
          `;
        } else {
          query = `
            MERGE user_book_scores AS target
            USING (SELECT $1 AS user_id, $2 AS book_id, $3 AS score) AS source
            ON (target.user_id = source.user_id AND target.book_id = source.book_id)
            WHEN MATCHED THEN
                UPDATE SET score = target.score + source.score, updated_at = ${timeFunc}
            WHEN NOT MATCHED THEN
                INSERT (user_id, book_id, score, updated_at) VALUES (source.user_id, source.book_id, source.score, ${timeFunc});
          `;
        }

        await executeQuery(query, [userId, bookId, score]);
        syncedCount++;
      } catch (dbErr) {
        console.error(`⚠️ [CRON] Error syncing ${actStr}:`, dbErr.message);
      }
    }

    if (activities.length > 0) {
      await redis.zrem('activity:queue', ...activities);
    }

    console.log(`✅ [CRON] Sync beres! ${syncedCount} baris masuk ke DB.`);
    return res.status(200).json({ 
      success: true, 
      message: 'Sync Redis to DB successful!',
      synced_rows: syncedCount
    });

  } catch (error) {
    console.error('❌ [CRON] Sync Redis to DB error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;