/**
 * Initialize Reading Sessions Table
 * Creates the reading_sessions table for tracking user reading progress
 */

require('dotenv').config();
const { Pool } = require('pg');

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initReadingSessions() {
  const client = await pgPool.connect();

  try {
    console.log('🔷 Initializing Reading Sessions...\n');

    // Create reading_sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reading_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        
        -- Reading progress
        current_page INTEGER NOT NULL DEFAULT 0,
        total_pages INTEGER NOT NULL DEFAULT 0,
        progress_percentage DECIMAL(5,2) DEFAULT 0,
        
        -- Timestamps
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP,
        
        -- Status: 'reading', 'paused', 'finished'
        status VARCHAR(20) NOT NULL DEFAULT 'reading',
        
        -- Reading duration in minutes
        reading_time_minutes INTEGER DEFAULT 0,
        
        CONSTRAINT reading_sessions_user_book_unique UNIQUE (user_id, book_id),
        CONSTRAINT reading_sessions_status_check CHECK (status IN ('reading', 'paused', 'finished'))
      );
    `);
    console.log('✓ Reading sessions table created');

    // Create indexes for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reading_sessions_user_id 
      ON reading_sessions(user_id);
    `);
    console.log('✓ Index on user_id created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reading_sessions_book_id 
      ON reading_sessions(book_id);
    `);
    console.log('✓ Index on book_id created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reading_sessions_status 
      ON reading_sessions(status);
    `);
    console.log('✓ Index on status created');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reading_sessions_started_at 
      ON reading_sessions(started_at DESC);
    `);
    console.log('✓ Index on started_at created');

    console.log('\n✅ Reading Sessions table initialized successfully!');
  } catch (error) {
    console.error('❌ Error initializing reading sessions:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pgPool.end();
  }
}

initReadingSessions();
