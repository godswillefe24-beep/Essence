-- Essence blog schema (Turso / libSQL, SQLite-compatible)
-- Applied automatically by migrate.js — no need to run this file manually.

CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    date TEXT NOT NULL,
    excerpt TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments (post_id);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL,
    bio TEXT DEFAULT '',
    avatar TEXT,
    posts INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    date TEXT NOT NULL
);

-- Single-row settings table (id is always 1)
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title TEXT NOT NULL DEFAULT 'Essence',
    description TEXT NOT NULL DEFAULT '',
    admin_password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_views (
    post_id TEXT PRIMARY KEY,
    views INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS post_likes (
    post_id TEXT PRIMARY KEY,
    likes INTEGER NOT NULL DEFAULT 0
);

-- Single-row sitewide stats (id is always 1). total_comments is intentionally
-- NOT stored here — it's derived with COUNT(*) from the comments table on
-- read, so it can never drift the way the old analytics.json counter could.
CREATE TABLE IF NOT EXISTS site_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_likes INTEGER NOT NULL DEFAULT 0
);
