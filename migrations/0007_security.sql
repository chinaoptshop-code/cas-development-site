-- Безпека API (functions/_rate.js): спільний rate-limit за хешем IP для /api/orders, /api/auth/* тощо.
CREATE TABLE IF NOT EXISTS rate_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket TEXT NOT NULL,          -- orders | auth | promo-order …
  ip_hash TEXT NOT NULL,         -- sha256(bucket|IP або IPv6 /64), сирий IP не зберігаємо
  created_at INTEGER NOT NULL    -- unix-секунди
);
CREATE INDEX IF NOT EXISTS rate_hits_bucket_ip ON rate_hits (bucket, ip_hash, created_at);
CREATE INDEX IF NOT EXISTS rate_hits_bucket_time ON rate_hits (bucket, created_at);
