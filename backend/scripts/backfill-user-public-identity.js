#!/usr/bin/env node
/**
 * Backfill users.username and users.display_name with readable values.
 *
 * Usage:
 *   node scripts/backfill-user-public-identity.js --dry-run
 *   node scripts/backfill-user-public-identity.js --apply
 */

require('dotenv').config();

const {
  initializeDatabase,
  executeQuery,
  closeDatabase,
} = require('../config/database');

function toNonEmptyString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toShortId(value) {
  const compact = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return compact.slice(0, 6) || 'reader';
}

function looksGeneratedHandle(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return true;

  if (/^u_[a-z0-9_]{12,}$/.test(raw)) return true;
  if (/^[a-z0-9_]{24,}$/.test(raw) && !/[aeiou]/.test(raw)) return true;

  return false;
}

function toHandle(value, fallbackId) {
  const source = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s.]/g, ' ')
    .replace(/[.\-\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (source.length >= 3 && !looksGeneratedHandle(source)) {
    return source.slice(0, 24);
  }

  return `pustara_${toShortId(fallbackId)}`;
}

function toDisplayName(value, fallbackId) {
  const text = toNonEmptyString(value);
  if (text && !looksGeneratedHandle(text)) return text;
  return `Pembaca ${toShortId(fallbackId)}`;
}

function normalizeIdentity(row) {
  const id = String(row.id || '');
  const username = toNonEmptyString(row.username);
  const displayName = toNonEmptyString(row.display_name);
  const emailLocal = toNonEmptyString(row.email) ? String(row.email).split('@')[0] : null;

  const nextDisplayName = toDisplayName(displayName || emailLocal || username, id);
  const nextUsername = toHandle(username || displayName || emailLocal, id);

  return {
    username: nextUsername,
    display_name: nextDisplayName,
  };
}

async function main() {
  const shouldApply = process.argv.includes('--apply');
  const dryRun = !shouldApply;

  console.log(`[backfill-user-public-identity] Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);

  await initializeDatabase();

  const usersResult = await executeQuery(
    'SELECT id, username, display_name, email FROM users ORDER BY created_at DESC LIMIT $1',
    [10000]
  );
  const rows = Array.isArray(usersResult)
    ? usersResult
    : Array.isArray(usersResult?.rows)
      ? usersResult.rows
      : [];

  let toUpdate = 0;
  let updated = 0;

  for (const row of rows) {
    const next = normalizeIdentity(row);
    const currentUsername = toNonEmptyString(row.username);
    const currentDisplayName = toNonEmptyString(row.display_name);

    const needUpdate =
      currentUsername !== next.username ||
      currentDisplayName !== next.display_name;

    if (!needUpdate) continue;
    toUpdate += 1;

    if (dryRun) {
      continue;
    }

    await executeQuery(
      'UPDATE users SET username = $1, display_name = $2, updated_at = NOW() WHERE id = $3',
      [next.username, next.display_name, row.id]
    );
    updated += 1;
  }

  console.log(`[backfill-user-public-identity] Scanned: ${rows.length}`);
  console.log(`[backfill-user-public-identity] Candidates: ${toUpdate}`);
  console.log(`[backfill-user-public-identity] Updated: ${updated}`);
}

main()
  .catch((err) => {
    console.error('[backfill-user-public-identity] Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closeDatabase();
    } catch (_) {
      // ignore close errors
    }
  });
