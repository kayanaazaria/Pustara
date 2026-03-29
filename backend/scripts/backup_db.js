require('dotenv').config();

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { Pool } = require('pg');

const { sendOpsAlert } = require('../services/opsAlertService');

function getBackupDir() {
  return process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getMetricsStatePath(dirPath) {
  return path.join(dirPath, 'backup-metrics.json');
}

function readState(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeState(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

async function getBooksCount(databaseUrl) {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const total = await pool.query('SELECT COUNT(*)::int AS total FROM books');
    const active = await pool.query('SELECT COUNT(*)::int AS total FROM books WHERE is_active = true');
    return {
      totalBooks: total.rows[0]?.total || 0,
      activeBooks: active.rows[0]?.total || 0,
    };
  } finally {
    await pool.end();
  }
}

async function detectDropAndAlert(databaseUrl, backupDir) {
  const thresholdPercent = Number(process.env.ALERT_BOOKS_DROP_THRESHOLD_PERCENT || 70);
  const minPreviousRows = Number(process.env.ALERT_BOOKS_MIN_PREVIOUS_ROWS || 30);

  const current = await getBooksCount(databaseUrl);
  const statePath = getMetricsStatePath(backupDir);
  const previous = readState(statePath);

  const snapshot = {
    timestamp: new Date().toISOString(),
    totalBooks: current.totalBooks,
    activeBooks: current.activeBooks,
  };
  writeState(statePath, snapshot);

  if (!previous || !Number.isFinite(previous.totalBooks)) {
    return { alerted: false, reason: 'baseline_created', current };
  }

  const prevTotal = Number(previous.totalBooks);
  if (prevTotal < minPreviousRows) {
    return { alerted: false, reason: 'previous_below_minimum', previous, current };
  }

  if (current.totalBooks >= prevTotal) {
    return { alerted: false, reason: 'no_drop', previous, current };
  }

  const dropPct = ((prevTotal - current.totalBooks) / prevTotal) * 100;
  if (dropPct < thresholdPercent) {
    return { alerted: false, reason: 'drop_below_threshold', dropPct, previous, current };
  }

  await sendOpsAlert('CRITICAL: Books row drop anomaly detected', [
    `Previous total books: ${prevTotal}`,
    `Current total books: ${current.totalBooks}`,
    `Drop: ${dropPct.toFixed(2)}%`,
    `Threshold: ${thresholdPercent}%`,
    `Previous timestamp: ${previous.timestamp || 'unknown'}`,
    'Action: investigate potential mass delete or data corruption immediately.',
  ]);

  return { alerted: true, dropPct, previous, current };
}

async function pruneOldBackups(dirPath, retentionDays) {
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.sql.gz'));

  let removed = 0;
  for (const fileName of files) {
    const fullPath = path.join(dirPath, fileName);
    const stats = fs.statSync(fullPath);
    if (now - stats.mtimeMs > maxAgeMs) {
      fs.unlinkSync(fullPath);
      removed += 1;
    }
  }

  return removed;
}

async function runBackup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for backup');
  }

  const backupDir = getBackupDir();
  ensureDir(backupDir);

  const fileName = `pustara-backup-${nowStamp()}.sql.gz`;
  const outputPath = path.join(backupDir, fileName);

  await new Promise((resolve, reject) => {
    const dump = spawn('pg_dump', ['--no-owner', '--no-privileges', databaseUrl], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    const gzip = zlib.createGzip({ level: 9 });
    const out = fs.createWriteStream(outputPath);
    let stderr = '';

    dump.stdout.pipe(gzip).pipe(out);
    dump.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    dump.on('error', (err) => reject(err));
    dump.on('close', (code) => {
      if (code === 0) return resolve();
      return reject(new Error(`pg_dump exited with code ${code}: ${stderr.slice(0, 400)}`));
    });
  });

  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 7);
  const pruned = await pruneOldBackups(backupDir, retentionDays);

  let anomaly = { alerted: false, reason: 'not_checked' };
  try {
    anomaly = await detectDropAndAlert(databaseUrl, backupDir);
  } catch (error) {
    anomaly = { alerted: false, reason: `anomaly_check_failed: ${error.message}` };
  }

  return { outputPath, pruned, retentionDays, anomaly };
}

async function main() {
  try {
    const result = await runBackup();
    console.log(JSON.stringify({ success: true, ...result }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    try {
      await sendOpsAlert('Pustara DB Backup FAILED', [
        `Error: ${error.message}`,
      ]);
    } catch (_) {
      // noop
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runBackup,
};
