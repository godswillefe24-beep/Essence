-- Run this once against your existing Turso database to add a place to
-- store the FULL post HTML content, not just the 160-char excerpt.
--
-- Why this matters: before this migration, posts/<slug>.html on disk was
-- the only copy of a post's real content. On Render's free tier the
-- filesystem is ephemeral across deploys/restarts, so that content could
-- be silently lost on redeploy while the DB row (title/excerpt) survived.
-- This column makes Turso the source of truth.
--
-- (Safe to run even if you've already run other migrations — this only
-- adds a column.)

ALTER TABLE posts ADD COLUMN content TEXT;
