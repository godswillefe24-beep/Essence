-- Run once against your Turso database to add per-post likes support.
-- (The existing site_stats.total_likes / POST /api/analytics/like stay as
-- they are — this adds a separate, per-post likes table alongside them.)

CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT PRIMARY KEY,
  likes   INTEGER NOT NULL DEFAULT 0
);
