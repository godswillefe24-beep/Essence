-- RETRACTION NOTICE — read this before doing anything.
--
-- The file `fix-post-views-keys.sql` from earlier this session was based
-- on an incorrect diagnosis. It assumed post_views.post_id should match
-- posts.slug ("post1", "post2"...). That's wrong: for the 16 hand-seeded
-- posts, migrate.js gives posts.id and posts.slug DIFFERENT values
-- (id: "2", slug: "post2") — and post_views/post_likes/comments are all
-- keyed by posts.id (the bare number), not slug. This was verifiable
-- directly in migrate.js's seed data and in post-actions.js's existing,
-- correct, unmodified likes-tracking code, neither of which I had seen
-- when I wrote the original migration.
--
-- ============================================================
-- IF YOU HAVE NOT RUN fix-post-views-keys.sql YET:
-- Do not run it. Delete it. Nothing else to do here — the original
-- bare-digit keys ("1", "2", ... "16") were already correct.
-- ============================================================
--
-- ============================================================
-- IF YOU ALREADY RAN fix-post-views-keys.sql:
-- It rewrote every bare-digit post_views key to a "postN" key, which no
-- longer matches posts.id — this would have broken the admin dashboard's
-- "Top Posts by Views" title lookup for posts 1-16 (previously working).
-- Run the statements below ONCE to reverse it.
-- ============================================================

-- 1. Move each "postN"-keyed row's views back onto the correct bare-digit
--    key, merging with any views recorded there since the incorrect
--    migration ran.
INSERT INTO post_views (post_id, views)
SELECT SUBSTR(post_id, 5), views
FROM post_views
WHERE post_id GLOB 'post[0-9]*'
ON CONFLICT(post_id) DO UPDATE SET
  views = post_views.views + excluded.views;

-- 2. Remove the incorrect "postN"-keyed rows now that their counts have
--    been merged back.
DELETE FROM post_views WHERE post_id GLOB 'post[0-9]*';

-- Note: this only repairs `post_views`. If you separately experimented
-- with the same "prefix with post" logic on `post_likes`, the identical
-- two-statement pattern (SUBSTR-and-merge, then DELETE) applies there too
-- — ask if you need that written out explicitly.
