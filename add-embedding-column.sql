-- Run this once against your existing Turso database to add embedding support.
-- (Safe to run even if you already ran the original schema.sql — this only adds a column.)

ALTER TABLE posts ADD COLUMN embedding TEXT;
