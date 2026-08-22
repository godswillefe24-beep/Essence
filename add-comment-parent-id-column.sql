-- Run once against your Turso database to support comment replies.
-- (Safe to run even if already applied — this only adds a column.)
--
-- NULL parent_id = a top-level comment. Non-NULL = a reply, and its value
-- is the id of the comment it's replying to. No FK constraint, matching
-- the pattern already used for post_id elsewhere in this schema.

ALTER TABLE comments ADD COLUMN parent_id TEXT;