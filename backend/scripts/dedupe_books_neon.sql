-- Neon/PostgreSQL deduplication + uniqueness guard for books(title, authors)
-- Keeps one row per (lower(trim(title)), authors), preferring earliest created_at then lowest id.

BEGIN;

-- 1) Optional inspection before delete
-- SELECT lower(trim(title)) AS normalized_title, authors, COUNT(*) AS dup_count
-- FROM books
-- GROUP BY lower(trim(title)), authors
-- HAVING COUNT(*) > 1
-- ORDER BY dup_count DESC, normalized_title ASC;

-- 2) Delete duplicates while keeping one canonical row per key
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(title)), authors
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM books
)
DELETE FROM books b
USING ranked r
WHERE b.id = r.id
  AND r.rn > 1;

-- 3) Prevent recurrence
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_book
ON books (lower(trim(title)), authors);

COMMIT;
