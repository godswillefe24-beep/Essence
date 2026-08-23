import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { all, get, run, transaction, db } from "./db.js";
import {
  sanitizeString,
  sanitizeEmail,
  escapeXml,
  buildPagination,
  slugify,
} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";

function loadEnvFile() {
  const envFile = path.join(__dirname, ".env");
  if (!fs.existsSync(envFile)) return;

  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;

    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim();
    if (!process.env[key]) {
      process.env[key] = value.replace(/^['"]|['"]$/g, "");
    }
  });
}

loadEnvFile();

// Middleware
app.disable("x-powered-by");

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin: allowedOrigins.length
      ? (origin, callback) => {
          // Requests without an Origin header are same-origin or server-to-server.
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          return callback(new Error("Origin is not allowed"));
        }
      : false,
  }),
);

// Keep uploads and chat requests bounded so malformed clients cannot consume
// unbounded memory before route-level validation runs.
app.use(express.json({ limit: "100kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Only advertise HSTS when the request actually arrived over HTTPS. This
  // avoids breaking local HTTP development while protecting production.
  if (req.secure || req.get("x-forwarded-proto") === "https") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  next();
});

const privateStaticFiles = new Set([
  "/server.js",
  "/db.js",
  "/migrate.js",
  "/backfill-post-content.js",
  "/embed-posts.js",
  "/embeddings.js",
  "/run-sql-file.js",
  "/utils.js",
  "/package.json",
  "/package-lock.json",
  "/render.yaml",
  "/Procfile",
  "/.htaccess",
]);

app.use((req, res, next) => {
  const requestPath = decodeURIComponent(req.path);
  const lowerPath = requestPath.toLowerCase();
  const isPrivatePath =
    lowerPath === "/.env" ||
    lowerPath.startsWith("/.env.") ||
    lowerPath.endsWith(".sql") ||
    lowerPath.endsWith(".md") ||
    lowerPath.endsWith(".log");

  if (
    privateStaticFiles.has(lowerPath) ||
    requestPath.startsWith("/routes/") ||
    requestPath.startsWith("/data/") ||
    isPrivatePath
  ) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(__dirname));

import chatRouter from "./routes/chat.js";
app.use("/api/chat", chatRouter);

// Lightweight liveness endpoint for Render and external monitors. Database
// readiness remains observable through the application-level API checks.
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: Math.floor(process.uptime()) });
});

// ==========================================
// LOGGING & VALIDATION HELPERS
// ==========================================

function logError(context, error) {
  console.error(`[ERROR] ${context}:`, error.message);
}

function logInfo(context, message) {
  console.log(`[INFO] ${context}: ${message}`);
}

// sanitizeString, sanitizeEmail, escapeXml moved to utils.js so they can be
// unit tested without importing this whole file (which connects to Turso
// and starts the server at import time).

// Defense-in-depth filtering for admin-supplied HTML. This is intentionally
// conservative until a full allowlist sanitizer is introduced: executable and
// browser-embedded elements are removed, inline handlers are stripped, and
// dangerous URL schemes are neutralized.
function stripDangerousHtml(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(
      /<\s*(?:script|iframe|object|embed|form|input|button|textarea|select|style|link|meta|base|svg|math)(?:\s[^>]*)?>[\s\S]*?<\s*\/\s*(?:script|iframe|object|embed|form|input|button|textarea|select|style|link|meta|base|svg|math)\s*>/gi,
      "",
    )
    .replace(
      /<\s*\/?\s*(?:script|iframe|object|embed|form|input|button|textarea|select|style|link|meta|base|svg|math)(?:\s[^>]*)?>/gi,
      "",
    )
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /\s+(?:href|src|xlink:href|action|formaction|poster)\s*=\s*("|')\s*(?:javascript|vbscript|data):[\s\S]*?\1/gi,
      "",
    )
    .replace(/\s+(?:href|src|xlink:href|action|formaction|poster)\s*=\s*(?:javascript|vbscript|data):[^\s>]+/gi, "");
}

function sanitizePostContent(content) {
  return stripDangerousHtml(sanitizeString(content));
}

// Rate limiting — was a hand-rolled in-memory Map that never evicted old
// keys (unbounded growth for the life of the process). express-rate-limit
// was already an installed dependency (package.json) but never actually
// imported anywhere in this file — the hand-rolled version was still what
// ran. Replacing it here completes that migration.
import { rateLimit } from "express-rate-limit";

// Render sits behind a reverse proxy; without this, req.ip resolves to the
// proxy's address (same value for every visitor), which would make every
// rate limit effectively global instead of per-client.
app.set("trust proxy", 1);

// Preserves the original per-route-per-IP budget: each method+path
// combination gets its own 100/min allowance, not one shared budget
// across the whole API (express-rate-limit's default key is IP-only).
const globalLimiter = rateLimit({
  windowMs: 60000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.method}-${req.path}-${req.ip}`,
  message: { error: "Too many requests, please try again later" },
});

const commentLimiter = rateLimit({
  windowMs: 60000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many comments, please wait before posting again" },
});

const subscribeLimiter = rateLimit({
  windowMs: 3600000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many subscription attempts, please try again later",
  },
});

const adminLoginLimiter = rateLimit({
  windowMs: 60000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please wait before trying again" },
});

const userAuthLimiter = rateLimit({
  windowMs: 900000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later" },
});

app.use(globalLimiter);

// ==========================================
// JWT SECRET — must be set explicitly now.
// Previously this silently generated a random secret if unset, which meant
// every restart on an ephemeral filesystem (e.g. Render free tier) quietly
// invalidated every logged-in session and admin token. Failing loudly here
// is safer than that silent failure mode.
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is not set. Generate one (e.g. " +
      "`node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"`) " +
      "and set it in your environment — without this, every server restart " +
      "invalidates all existing logins.",
  );
}

const USER_AUTH_COOKIE = "essence_user_auth";
const ADMIN_AUTH_COOKIE = "essence_admin_auth";
const AUTH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, pair) => {
    const separator = pair.indexOf("=");
    if (separator < 0) return cookies;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!key) return cookies;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
    return cookies;
  }, {});
}

function getAuthToken(req, cookieName = USER_AUTH_COOKIE) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return parseCookies(req.headers.cookie)[cookieName] || null;
}

function setAuthCookie(req, res, token, cookieName = USER_AUTH_COOKIE) {
  const secure =
    process.env.NODE_ENV === "production" ||
    req.secure ||
    req.get("x-forwarded-proto") === "https";
  const attributes = [
    `${cookieName}=${encodeURIComponent(token)}`,
    `Max-Age=${AUTH_MAX_AGE_SECONDS}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) attributes.push("Secure");
  res.setHeader("Cache-Control", "no-store");
  res.append("Set-Cookie", attributes.join("; "));
}

function clearAuthCookie(req, res, cookieName = USER_AUTH_COOKIE) {
  const secure =
    process.env.NODE_ENV === "production" ||
    req.secure ||
    req.get("x-forwarded-proto") === "https";
  const attributes = [
    `${cookieName}=`,
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) attributes.push("Secure");
  res.setHeader("Cache-Control", "no-store");
  res.append("Set-Cookie", attributes.join("; "));
}

// Email configuration (using test credentials - configure with real service)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "your-email@gmail.com",
    pass: process.env.EMAIL_PASSWORD || "your-app-password",
  },
});

// ==========================================
// DATA ACCESS HELPERS (replace old fs-based readX/writeX functions)
// ==========================================

// Preview/list column set — deliberately excludes `content` (full article
// HTML, can be large) and `embedding` (a serialized vector, also large).
// Both now exist on the posts table but neither belongs in a list response;
// use getPostFull() below when the full article is actually needed.
const POST_PREVIEW_COLUMNS =
  "id, slug, title, category, date, excerpt, updated_at";

async function readPosts() {
  return all(`SELECT ${POST_PREVIEW_COLUMNS} FROM posts ORDER BY date DESC`);
}

// Full single-post fetch, including content — used by the new
// GET /api/posts/:id route below for dynamic (DB-driven) rendering.
async function getPostFull(idOrSlug) {
  return get("SELECT * FROM posts WHERE id = ? OR slug = ?", [
    idOrSlug,
    idOrSlug,
  ]);
}

// Turns a title into a unique slug, appending -2, -3, ... on collision.
// Falls back to "post" as the base if the title slugifies to nothing at
// all (e.g. a title made entirely of emoji/symbols) so post creation
// can't fail outright over an edge-case title.
async function generateUniqueSlug(title) {
  const base = slugify(title) || "post";
  let candidate = base;
  let suffix = 2;
  while (await get("SELECT id FROM posts WHERE slug = ?", [candidate])) {
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  return candidate;
}

function mapComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    name: row.name,
    text: row.text,
    timestamp: row.timestamp,
    parentId: row.parent_id || null,
  };
}

async function readComments() {
  const rows = await all("SELECT * FROM comments ORDER BY timestamp DESC");
  return rows.map(mapComment);
}

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    password: row.password,
    createdAt: row.created_at,
    bio: row.bio,
    avatar: row.avatar,
    posts: row.posts,
    comments: row.comments,
  };
}

async function readSubscribers() {
  return all("SELECT * FROM subscribers ORDER BY date DESC");
}

async function getAdminPasswordHash() {
  const row = await get(
    "SELECT admin_password_hash FROM settings WHERE id = 1",
  );
  return row ? row.admin_password_hash : null;
}

// ==========================================
// API: Get all comments for a post
// ==========================================
app.get("/api/comments/:postId", async (req, res) => {
  try {
    const rows = await all(
      "SELECT * FROM comments WHERE post_id = ? ORDER BY timestamp DESC",
      [req.params.postId],
    );
    res.json(rows.map(mapComment));
  } catch (error) {
    logError("Get comments", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// API: Post a new comment
app.post("/api/comments", commentLimiter, async (req, res) => {
  try {
    const { postId, name, text, parentId } = req.body;

    const sanitizedPostId = sanitizeString(postId);
    const sanitizedName = sanitizeString(name || "Anonymous");
    const sanitizedText = sanitizeString(text);
    const sanitizedParentId = parentId ? sanitizeString(parentId) : null;

    if (!sanitizedPostId || !sanitizedText || sanitizedText.length < 2) {
      return res.status(400).json({
        error:
          "Missing or invalid required fields (name, text required, min 2 chars)",
      });
    }

    // A reply must actually be replying to something real, on the same
    // post — otherwise a client could post a "reply" pointing at an id
    // that doesn't exist (or belongs to a different post entirely) and
    // it would render as an orphaned/mismatched nested comment.
    if (sanitizedParentId) {
      const parent = await get(
        "SELECT id FROM comments WHERE id = ? AND post_id = ?",
        [sanitizedParentId, sanitizedPostId],
      );
      if (!parent) {
        return res.status(400).json({ error: "Invalid comment to reply to" });
      }
    }

    const token = getAuthToken(req);


    let userId = null;
    let userName = sanitizedName;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
        userName = decoded.username;
      } catch (e) {
        logError("Token validation", e);
      }
    }

    const newComment = {
      id: crypto.randomUUID(),
      postId: sanitizedPostId,
      userId,
      name: userName,
      text: sanitizedText,
      timestamp: new Date().toISOString(),
      parentId: sanitizedParentId,
    };

    await run(
      `INSERT INTO comments (id, post_id, user_id, name, text, timestamp, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newComment.id,
        newComment.postId,
        newComment.userId,
        newComment.name,
        newComment.text,
        newComment.timestamp,
        newComment.parentId,
      ],
    );

    if (userId) {
      await run("UPDATE users SET comments = comments + 1 WHERE id = ?", [
        userId,
      ]);
    }

    logInfo("Comment", `Posted on post ${sanitizedPostId}`);
    res.status(201).json(newComment);
  } catch (error) {
    logError("Post comment", error);
    res.status(500).json({ error: "Failed to post comment" });
  }
});

// API: Get all comments (admin only) — top-level only. Replies are
// intentionally excluded here so they don't clutter the moderation list
// as if they were separate comments; deleting a top-level comment via
// DELETE /api/admin/comments/:id also removes its replies (see below).
app.get("/api/admin/comments", verifyAdmin, async (req, res) => {
  try {
    const rows = await all(
      "SELECT * FROM comments WHERE parent_id IS NULL ORDER BY timestamp DESC",
    );
    res.json(rows.map(mapComment));
  } catch (error) {
    logError("Admin get comments", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// API: Delete a comment (admin only) — also deletes any replies to it,
// so moderation can't leave orphaned replies with no visible parent.
app.delete("/api/admin/comments/:id", verifyAdmin, async (req, res) => {
  try {
    await run("DELETE FROM comments WHERE parent_id = ?", [req.params.id]);
    const { rowsAffected } = await run("DELETE FROM comments WHERE id = ?", [
      req.params.id,
    ]);
    if (rowsAffected === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }
    res.json({ success: true });
  } catch (error) {
    logError("Delete comment", error);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

// ==========================================
// API: Get analytics
// ==========================================
app.get("/api/analytics", async (req, res) => {
  try {
    // Consolidate queries: instead of 5 separate queries, use 4 efficient ones
    const [
      likesSumRow,
      commentCountRow,
      subscriberCountRow,
      viewRows,
      postsCountRow,
    ] = await Promise.all([
      get("SELECT SUM(likes) as total FROM post_likes"),
      get("SELECT COUNT(*) as count FROM comments"),
      get("SELECT COUNT(*) as count FROM subscribers"),
      all("SELECT post_id, views FROM post_views"),
      get("SELECT COUNT(*) as count FROM posts"),
    ]);

    const postViews = {};
    viewRows.forEach((r) => {
      postViews[r.post_id] = r.views;
    });

    res.json({
      postViews,
      totalLikes: likesSumRow?.total || 0,
      totalComments: commentCountRow ? commentCountRow.count : 0,
      totalSubscribers: subscriberCountRow ? subscriberCountRow.count : 0,
      totalPosts: postsCountRow?.count || 0,
    });
  } catch (error) {
    logError("Get analytics", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// API: Record page view
app.post("/api/analytics/view/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;
    await run(
      `INSERT INTO post_views (post_id, views) VALUES (?, 1)
       ON CONFLICT(post_id) DO UPDATE SET views = views + 1`,
      [postId],
    );
    res.json({ success: true });
  } catch (error) {
    logError("Record view", error);
    res.status(500).json({ error: "Failed to record view" });
  }
});

// API: Like a post
app.post("/api/analytics/like", async (req, res) => {
  try {
    const result = await db.execute(
      "UPDATE site_stats SET total_likes = total_likes + 1 WHERE id = 1 RETURNING total_likes",
    );
    const totalLikes = result.rows[0]?.total_likes || 0;
    res.json({ totalLikes });
  } catch (error) {
    logError("Record like", error);
    res.status(500).json({ error: "Failed to record like" });
  }
});

// ---- Per-post likes (separate from the sitewide counter above) ----------
// The sitewide /api/analytics/like endpoint above only tracks one global
// number, which doesn't work for a like button that lives on each post.
// These endpoints track likes per post_id, the same way post_views does.

app.get("/api/analytics/likes/:postId", async (req, res) => {
  try {
    const row = await get("SELECT likes FROM post_likes WHERE post_id = ?", [
      req.params.postId,
    ]);
    res.json({ postId: req.params.postId, likes: row ? row.likes : 0 });
  } catch (error) {
    logError("Get post likes", error);
    res.status(500).json({ error: "Failed to fetch likes" });
  }
});

app.post("/api/analytics/like/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;
    const result = await db.execute({
      sql: `INSERT INTO post_likes (post_id, likes) VALUES (?, 1)
            ON CONFLICT(post_id) DO UPDATE SET likes = likes + 1
            RETURNING likes`,
      args: [postId],
    });
    const likes = result.rows[0]?.likes || 0;
    res.json({ postId, likes });
  } catch (error) {
    logError("Like post", error);
    res.status(500).json({ error: "Failed to record like" });
  }
});

app.post("/api/analytics/unlike/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;
    const result = await db.execute({
      sql: `INSERT INTO post_likes (post_id, likes) VALUES (?, 0)
            ON CONFLICT(post_id) DO UPDATE SET likes = MAX(likes - 1, 0)
            RETURNING likes`,
      args: [postId],
    });
    const likes = result.rows[0]?.likes || 0;
    res.json({ postId, likes });
  } catch (error) {
    logError("Unlike post", error);
    res.status(500).json({ error: "Failed to record unlike" });
  }
});

// ==========================================
// POSTS: Public list and admin create/delete
// ==========================================

app.get("/api/posts", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 6);
    const query = sanitizeString(req.query.q || "").toLowerCase();
    const category = sanitizeString(req.query.category || "").toLowerCase();

    const conditions = [];
    const params = [];

    if (query) {
      conditions.push(
        "(LOWER(title) LIKE ? OR LOWER(excerpt) LIKE ? OR LOWER(category) LIKE ?)",
      );
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }

    if (category) {
      conditions.push("LOWER(category) = ?");
      params.push(category);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRow = await get(`SELECT COUNT(*) AS count FROM posts ${whereClause}`, params);
    const pagination = buildPagination({
      total: Number(countRow?.count || 0),
      page,
      limit,
    });
    const posts = await all(
      `SELECT ${POST_PREVIEW_COLUMNS} FROM posts ${whereClause} ORDER BY date DESC LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset],
    );

    res.json({ posts, pagination });
  } catch (error) {
    logError("Get posts", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Public: get a single post's full content (id or slug) — the DB-backed
// replacement for reading posts/<slug>.html directly. Powers dynamic
// post rendering: fetch this, then render `content` into a template
// client-side or via SSR, instead of relying on the static file.
app.get("/api/posts/:idOrSlug", async (req, res) => {
  try {
    const post = await getPostFull(req.params.idOrSlug);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.json(post);
  } catch (error) {
    logError("Get single post", error);
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

// Public: fetch a small related-post set without transferring the full catalog.
app.get("/api/posts/:idOrSlug/related", async (req, res) => {
  try {
    const current = await get(
      "SELECT id, category FROM posts WHERE id = ? OR slug = ?",
      [req.params.idOrSlug, req.params.idOrSlug],
    );
    if (!current || !current.category) return res.json([]);

    const related = await all(
      `SELECT ${POST_PREVIEW_COLUMNS} FROM posts
       WHERE LOWER(category) = LOWER(?) AND id <> ?
       ORDER BY date DESC LIMIT 3`,
      [current.category, current.id],
    );
    res.json(related);
  } catch (error) {
    logError("Related posts", error);
    res.status(500).json({ error: "Failed to fetch related posts" });
  }
});

// Public: search posts by title or content
app.get("/api/posts/search/:query", async (req, res) => {
  try {
    let query = decodeURIComponent(req.params.query || "").toLowerCase();
    if (query.length < 2) {
      return res
        .status(400)
        .json({ error: "Search query must be at least 2 characters" });
    }

    query = sanitizeString(query);
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 6);
    const countRow = await get(
      `SELECT COUNT(*) AS count FROM posts
       WHERE LOWER(title) LIKE ? OR LOWER(excerpt) LIKE ? OR LOWER(category) LIKE ?`,
      [`%${query}%`, `%${query}%`, `%${query}%`],
    );
    const pagination = buildPagination({
      total: Number(countRow?.count || 0),
      page,
      limit,
    });
    const results = await all(
      `SELECT ${POST_PREVIEW_COLUMNS} FROM posts 
       WHERE LOWER(title) LIKE ? OR LOWER(excerpt) LIKE ? OR LOWER(category) LIKE ?
       ORDER BY date DESC LIMIT ? OFFSET ?`,
      [
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
        pagination.limit,
        pagination.offset,
      ],
    );

    logInfo("Search", `Query: "${query}", Results: ${results.length}`);
    res.json({ posts: results, pagination });
  } catch (error) {
    logError("Search posts", error);
    res.status(500).json({ error: "Failed to search posts" });
  }
});

// Public: get popular tags/categories
app.get("/api/tags/popular", async (req, res) => {
  try {
    // Use SQL to aggregate tags, avoiding loading entire post table into memory
    // Split comma-separated categories by extracting individual tags with GROUP BY
    const rows = await all(`
      SELECT TRIM(category) as name, COUNT(*) as count
      FROM posts
      WHERE category IS NOT NULL AND category != ''
      GROUP BY TRIM(category)
      ORDER BY count DESC
      LIMIT 10
    `);

    logInfo("Popular Tags", `Found ${rows.length} tags`);
    res.json(rows);
  } catch (error) {
    logError("Popular tags", error);
    res.status(500).json({ error: "Failed to fetch popular tags" });
  }
});

// Admin: create post (persist metadata and write HTML file)
//
// NOTE — pre-existing behavior, not changed by this migration: this writes
// a generic auto-generated HTML template to posts/<id>.html. If <id> matches
// one of your real hand-built posts (post1-16), this will OVERWRITE that
// real page with the generic template. This risk existed before the
// migration too (the old posts.json had the same id scheme) — flagging it
// here since it's easy to forget. Safest practice: only use this admin
// endpoint for genuinely new posts with new ids, not to edit post1-16.
app.post("/api/admin/posts", verifyAdmin, async (req, res) => {
  try {
    const { title, category, content, date } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const sanitizedTitle = sanitizeString(title);
    const sanitizedCategory = sanitizeString(category || "Uncategorized");
    const sanitizedContent = sanitizePostContent(content);

    if (!sanitizedTitle || !sanitizedContent) {
      return res.status(400).json({ error: "Invalid title or content" });
    }

    // Server-generated slug from the title, replacing the old client-side
    // `"post-" + Date.now()` scheme. id and slug are kept equal here (same
    // convention the old scheme used) — only the legacy seeded posts
    // (1-16) have id decoupled from slug; every extraction of a post
    // identifier from a URL elsewhere in this codebase (script.js,
    // post-actions.js) already accounts for that split, so this doesn't
    // require touching any of that logic.
    const generatedSlug = await generateUniqueSlug(sanitizedTitle);

    const postMeta = {
      id: generatedSlug,
      title: sanitizedTitle,
      category: sanitizedCategory,
      date: date || new Date().toISOString(),
      slug: generatedSlug,
      excerpt: sanitizedContent.slice(0, 160),
    };

    // `content` is now persisted to Turso — this is the fix for the gap
    // where full post content only ever lived in posts/<slug>.html, which
    // is lost on every redeploy on Render's free tier (ephemeral disk).
    // The static file below is still written too, so RSS/sitemap
    // generation (which read posts/*.html directly) keep working
    // unchanged — Turso is now the source of truth either way.
    await run(
      `INSERT OR REPLACE INTO posts (id, slug, title, category, date, excerpt, content, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        postMeta.id,
        postMeta.slug,
        postMeta.title,
        postMeta.category,
        postMeta.date,
        postMeta.excerpt,
        sanitizedContent,
        new Date().toISOString(),
      ],
    );

    const postsDir = path.join(__dirname, "posts");
    if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

    const filename = `${postMeta.slug}.html`;
    const filepath = path.join(postsDir, filename);
    const metaDescription = postMeta.excerpt.replace(/"/g, "'");
    const canonicalUrl = `https://essence-blog.com/posts/${filename}`;
    const formattedDate = new Date(postMeta.date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    // Matches other real posts' style loosely: category plus a couple of
    // generic terms. Real posts have hand-curated keywords per topic —
    // this is a reasonable automatic stand-in, not a true equivalent.
    const keywords = `${postMeta.category}, blog, Essence`;

    const html = `<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="description" content="${escapeXml(metaDescription)}" />
  <meta name="keywords" content="${escapeXml(keywords)}" />
  <meta name="author" content="Efe" />
  <meta name="robots" content="index, follow" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeXml(postMeta.title)} - Essence" />
  <meta property="og:description" content="${escapeXml(metaDescription)}" />
  <meta property="og:url" content="${canonicalUrl}" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeXml(postMeta.title)}" />
  <meta name="twitter:description" content="${escapeXml(metaDescription)}" />

  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Essence" />
  <title>${escapeXml(postMeta.title)} - Essence</title>
  <link rel="canonical" href="${canonicalUrl}" />
  <link rel="apple-touch-icon"
    href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'><circle cx='90' cy='90' r='85' fill='%233b82f6' opacity='0.1'/><circle cx='90' cy='90' r='75' fill='none' stroke='%233b82f6' stroke-width='3' opacity='0.3'/><circle cx='90' cy='90' r='65' fill='none' stroke='%233b82f6' stroke-width='3'/><path d='M 65 100 Q 90 60 115 100' stroke='%233b82f6' stroke-width='4' fill='none' stroke-linecap='round'/><circle cx='65' cy='100' r='4' fill='%233b82f6'/><circle cx='90' cy='60' r='4' fill='%233b82f6'/><circle cx='115' cy='100' r='4' fill='%233b82f6'/></svg>" />
  <link rel="manifest" href="../manifest.json" />
  <link rel="stylesheet" href="../styles.css" />
  <link rel="stylesheet" href="../public/css/chat-widget.css">
  <link rel="stylesheet" href="../public/css/post-actions.css">
  <link rel="stylesheet" href="../public/css/related-posts.css">
  <!-- Favicon as SVG -->
  <link rel="icon" type="image/svg+xml"
    href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%233b82f6' opacity='0.1'/><circle cx='50' cy='50' r='40' fill='none' stroke='%233b82f6' stroke-width='2' opacity='0.3'/><circle cx='50' cy='50' r='35' fill='none' stroke='%233b82f6' stroke-width='2'/><path d='M 35 55 Q 50 35 65 55' stroke='%233b82f6' stroke-width='2.5' fill='none' stroke-linecap='round'/><circle cx='35' cy='55' r='2' fill='%233b82f6'/><circle cx='50' cy='35' r='2' fill='%233b82f6'/><circle cx='65' cy='55' r='2' fill='%233b82f6'/></svg>" />

  <!-- JSON-LD Article Schema -->
  <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": "${escapeXml(postMeta.title)}",
        "description": "${escapeXml(metaDescription)}",
        "datePublished": "${postMeta.date}",
        "dateModified": "${postMeta.date}",
        "author": {
          "@type": "Person",
          "name": "Efe"
        },
        "publisher": {
          "@type": "Organization",
          "name": "Essence Blog",
          "logo": {
            "@type": "ImageObject",
            "url": "https://essence-blog.com/logo.png"
          }
        },
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": "${canonicalUrl}"
        }
      }
    </script>
</head>

<body>
  <header class="site-header">
    <div class="header-top">
      <a href="../index.html" class="back-btn">← Back</a>
      <h1>${escapeXml(postMeta.title)}</h1>
      <button id="theme-toggle" class="theme-btn" title="Toggle dark mode">
        🌙
      </button>
    </div>
  </header>

  <main class="container">
    <article class="post-preview">
      <p class="post-meta">${formattedDate}</p>
      <h1>${escapeXml(postMeta.title)}</h1>
      <!-- Real posts (e.g. post1.html) wrap this in a second, nested
           <main> — invalid HTML (main must not be a descendant of
           another main), so this uses a plain div instead. Also: real
           posts have a hand-picked hero image here; the admin form
           doesn't collect one, so there isn't one to insert. -->
      <div>
        ${sanitizedContent}
      </div>

      <section class="comments-section" data-post-id="${escapeXml(postMeta.id)}">
        <h3>💬 Comments (<span class="comments-count">0</span>)</h3>
        <div class="comments-list"></div>
        <div class="comment-form">
          <h4>Leave a Comment</h4>
          <input type="text" class="comment-name" placeholder="Your name..." />
          <textarea class="comment-text" placeholder="Share your thoughts..." rows="4"></textarea>
          <button class="comment-submit">Post Comment</button>
        </div>
      </section>
    </article>

    <aside class="sidebar">
      <h3>About</h3>
      <p>Sharing Knowledge, Ideas, and Inspiration Every Day.</p>
    </aside>
  </main>

  <footer class="site-footer">
    <div class="footer-content">
      <div class="footer-section">
        <h4>About</h4>
        <p>A modern blog built with simplicity in mind.</p>
      </div>
      <div class="footer-section">
        <h4>Pages</h4>
        <ul>
          <li><a href="../index.html">Home</a></li>
          <li><a href="../index.html#posts-section">All Posts</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; ${new Date(postMeta.date).getFullYear()} — Efe. Built with ❤️</p>
    </div>
  </footer>
  <!-- Back to Top Button -->
  <button class="back-to-top" title="Back to top">
    <span>⬆️</span>
  </button>
</body>
<script src="../script.js"></script>
<script src="../public/js/chat-widget.js"></script>
<script src="../public/js/post-actions.js"></script>
<script src="../public/js/related-posts.js"></script>

</html>`;

    fs.writeFileSync(filepath, html, "utf8");

    res.json({ success: true, id: postMeta.id, url: `/posts/${filename}` });
  } catch (error) {
    logError("Create post", error);
    res.status(500).json({ error: "Failed to save post" });
  }
});

// Admin: delete post (remove metadata and file)
app.delete("/api/admin/posts/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await get("SELECT * FROM posts WHERE id = ? OR slug = ?", [
      id,
      id,
    ]);
    if (!post) return res.status(404).json({ error: "Post not found" });

    await run("DELETE FROM posts WHERE id = ?", [post.id]);

    const postsDir = path.join(__dirname, "posts");
    const filepath = path.join(postsDir, `${post.slug}.html`);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    logInfo("Delete post", `Post "${post.title}" deleted`);
    res.json({ success: true });
  } catch (error) {
    logError("Delete post", error);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// Admin: edit post metadata and content
app.put("/api/admin/posts/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const sanitizedTitle = sanitizeString(title);
    const sanitizedCategory = sanitizeString(category || "Uncategorized");
    const sanitizedContent = sanitizePostContent(content);

    if (!sanitizedTitle || !sanitizedContent) {
      return res.status(400).json({ error: "Invalid title or content" });
    }

    const post = await get("SELECT * FROM posts WHERE id = ? OR slug = ?", [
      id,
      id,
    ]);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const excerpt = sanitizedContent.slice(0, 160);
    await run(
      `UPDATE posts SET title = ?, category = ?, excerpt = ?, content = ?, updated_at = ? WHERE id = ?`,
      [
        sanitizedTitle,
        sanitizedCategory,
        excerpt,
        sanitizedContent,
        new Date().toISOString(),
        post.id,
      ],
    );

    const postsDir = path.join(__dirname, "posts");
    const filename = `${post.slug}.html`;
    const filepath = path.join(postsDir, filename);
    const metaDescription = excerpt.replace(/"/g, "'");
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeXml(sanitizedTitle)}</title>
    <meta name="description" content="${escapeXml(metaDescription)}" />
    <meta property="og:title" content="${escapeXml(sanitizedTitle)}" />
    <meta property="og:description" content="${escapeXml(metaDescription)}" />
    <script type="application/ld+json">{ "@context": "https://schema.org", "@type": "BlogPosting", "headline": "${escapeXml(sanitizedTitle)}", "datePublished": "${post.date}" }</script>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <article class="post">
      <header>
        <h1>${escapeXml(sanitizedTitle)}</h1>
        <p class="meta">${new Date(post.date).toLocaleString()} \u2022 ${escapeXml(sanitizedCategory)}</p>
      </header>
      <section class="content">
        ${sanitizedContent}
      </section>
    </article>
    <script src="/script.js" defer></script>
  </body>
</html>`;

    fs.writeFileSync(filepath, html, "utf8");

    logInfo("Edit post", `Post "${sanitizedTitle}" updated`);
    res.json({ success: true, id, title: sanitizedTitle });
  } catch (error) {
    logError("Edit post", error);
    res.status(500).json({ error: "Failed to edit post" });
  }
});

// Public: get related posts by category
app.get("/api/posts/related/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const posts = await readPosts();

    const related = posts.filter((p) => p.category === category).slice(0, 3);

    if (related.length === 0) {
      return res.json(posts.slice(0, 3));
    }

    res.json(related);
  } catch (error) {
    logError("Related posts", error);
    res.status(500).json({ error: "Failed to fetch related posts" });
  }
});

// ==========================================
// API: Subscribe to newsletter
// ==========================================
app.post("/api/subscribe", subscribeLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const existing = await get("SELECT id FROM subscribers WHERE email = ?", [
      sanitizedEmail,
    ]);
    if (existing) {
      return res.status(400).json({ error: "Email already subscribed" });
    }

    const subscribedAt = new Date().toISOString();
    await run("INSERT INTO subscribers (email, date) VALUES (?, ?)", [
      sanitizedEmail,
      subscribedAt,
    ]);

    logInfo("Subscribe", `New subscriber: ${sanitizedEmail}`);

    const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
    const MAILCHIMP_LIST_ID = process.env.MAILCHIMP_LIST_ID;
    if (MAILCHIMP_API_KEY && MAILCHIMP_LIST_ID) {
      try {
        const dc = MAILCHIMP_API_KEY.split("-")[1];
        const url = `https://${dc}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members`;
        const body = JSON.stringify({
          email_address: sanitizedEmail,
          status: "subscribed",
        });
        const auth = Buffer.from(`any:${MAILCHIMP_API_KEY}`).toString("base64");
        const mcRes = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${auth}`,
          },
          body,
        });
        if (!mcRes.ok) {
          const mcErr = await mcRes.text();
          logError("Mailchimp subscribe", new Error(mcErr));
        }
      } catch (mcError) {
        logError("Mailchimp integration", mcError);
      }
    }

    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    const sendConfirmation = async () => {
      const subject = "Welcome to the Essence newsletter!";
      const html = `
        <h2>Welcome to the Blog!</h2>
        <p>Thanks for subscribing. You'll receive updates when new posts are published.</p>
        <p>\u2014 Efe</p>
      `;

      if (SENDGRID_API_KEY && globalThis.fetch) {
        try {
          await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SENDGRID_API_KEY}`,
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: sanitizedEmail }] }],
              from: {
                email: process.env.EMAIL_FROM || "no-reply@essence-blog.com",
                name: "Essence",
              },
              subject,
              content: [{ type: "text/html", value: html }],
            }),
          });
        } catch (sgErr) {
          logError("SendGrid send", sgErr);
        }
      } else {
        try {
          await transporter.sendMail({
            from: process.env.EMAIL_USER || "your-email@gmail.com",
            to: sanitizedEmail,
            subject,
            html,
          });
        } catch (mailErr) {
          logError("Email send", mailErr);
        }
      }
    };

    sendConfirmation().catch(() => {});

    res.json({ success: true, message: "Subscribed successfully" });
  } catch (error) {
    logError("Subscribe", error);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// ==========================================
// USER AUTHENTICATION
// ==========================================

app.post("/api/auth/register", userAuthLimiter, async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    const sanitizedUsername = sanitizeString(username).slice(0, 50);
    const sanitizedEmail = sanitizeEmail(email);

    if (!sanitizedUsername || !sanitizedEmail || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    const existing = await get(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [sanitizedEmail, sanitizedUsername],
    );
    if (existing) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: crypto.randomUUID(),
      username: sanitizedUsername,
      email: sanitizedEmail,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      bio: "",
      avatar: null,
      posts: 0,
      comments: 0,
    };

    await run(
      `INSERT INTO users (id, username, email, password, created_at, bio, avatar, posts, comments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newUser.id,
        newUser.username,
        newUser.email,
        newUser.password,
        newUser.createdAt,
        newUser.bio,
        newUser.avatar,
        newUser.posts,
        newUser.comments,
      ],
    );

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, email: newUser.email },
      JWT_SECRET,
      { expiresIn: "30d" },
    );
    setAuthCookie(req, res, token);

    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        bio: newUser.bio,
        avatar: newUser.avatar,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error) {
    logError("Register", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

app.post("/api/auth/login", userAuthLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const sanitizedEmail = sanitizeEmail(email);

    if (!sanitizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const row = await get("SELECT * FROM users WHERE email = ?", [sanitizedEmail]);
    if (!row) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const user = mapUser(row);

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" },
    );
    setAuthCookie(req, res, token);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        createdAt: user.createdAt,
        posts: user.posts,
        comments: user.comments,
      },
    });
  } catch (error) {
    logError("Login", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(req, res, USER_AUTH_COOKIE);
  res.json({ success: true });
});

app.post("/api/admin/logout", (req, res) => {
  clearAuthCookie(req, res, ADMIN_AUTH_COOKIE);
  res.json({ success: true });
});

app.post("/api/auth/validate", async (req, res) => {
  try {
    const token = getAuthToken(req);


    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const row = await get("SELECT * FROM users WHERE id = ?", [decoded.id]);

    if (!row) {
      return res.status(401).json({ error: "User not found" });
    }
    const user = mapUser(row);

    res.json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        posts: user.posts,
        comments: user.comments,
      },
    });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

app.get("/api/users/:username", async (req, res) => {
  try {
    const row = await get("SELECT * FROM users WHERE username = ?", [
      req.params.username,
    ]);
    if (!row) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = mapUser(row);

    res.json({
      id: user.id,
      username: user.username,
      bio: user.bio,
      avatar: user.avatar,
      createdAt: user.createdAt,
      posts: user.posts,
      comments: user.comments,
    });
  } catch (error) {
    logError("Get user profile", error);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

app.put("/api/users/profile/:id", async (req, res) => {
  try {
    const token = getAuthToken(req);


    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.id !== req.params.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const { bio } = req.body;
    const existing = await get("SELECT * FROM users WHERE id = ?", [
      req.params.id,
    ]);
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    const newBio = bio || existing.bio;
    await run("UPDATE users SET bio = ? WHERE id = ?", [newBio, req.params.id]);

    res.json({
      success: true,
      user: {
        id: existing.id,
        username: existing.username,
        email: existing.email,
        bio: newBio,
        avatar: existing.avatar,
      },
    });
  } catch (error) {
    logError("Update profile", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

app.post("/api/admin/login", adminLoginLimiter, async (req, res) => {
  const { password } = req.body;

  try {
    if (typeof password !== "string" || !password) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const hash = await getAdminPasswordHash();
    if (!hash) {
      logError("Admin login", new Error("No admin password configured"));
      return res.status(500).json({ error: "Admin login is not configured" });
    }

    // bcrypt.compare is already constant-time with respect to the secret,
    // so no separate timing-safe comparison step is needed here (unlike the
    // old plaintext-comparison version).
    const isMatch = await bcrypt.compare(password, hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "12h" });
    setAuthCookie(req, res, token, ADMIN_AUTH_COOKIE);
    res.json({ success: true });
  } catch (err) {
    logError("Admin login", err);
    res.status(500).json({ error: "Login failed" });
  }
});

function verifyAdmin(req, res, next) {
  const token = getAuthToken(req, ADMIN_AUTH_COOKIE);

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Unauthorized" });
  }
}

// ==========================================
// ADMIN: SUBSCRIBERS MANAGEMENT
// ==========================================

app.get("/api/admin/subscribers", verifyAdmin, async (req, res) => {
  try {
    const subscribers = await readSubscribers();
    res.json(
      subscribers.map((s) => ({ id: s.id, email: s.email, date: s.date })),
    );
  } catch (error) {
    logError("Get subscribers", error);
    res.status(500).json({ error: "Failed to fetch subscribers" });
  }
});

// NOTE: this now deletes by the subscriber's real database id (returned by
// GET above), not a positional array index like before. The old index-based
// approach was fragile — deleting the wrong row was possible if the list
// changed between fetch and delete. Frontend code is unaffected since it
// just echoes back whatever `id` the GET response provided.
app.delete("/api/admin/subscribers/:id", verifyAdmin, async (req, res) => {
  try {
    const { rowsAffected } = await run("DELETE FROM subscribers WHERE id = ?", [
      req.params.id,
    ]);
    if (rowsAffected === 0) {
      return res.status(404).json({ error: "Subscriber not found" });
    }
    res.json({ success: true });
  } catch (error) {
    logError("Delete subscriber", error);
    res.status(500).json({ error: "Failed to delete subscriber" });
  }
});

function escapeCsvCell(value) {
  const text = String(value ?? "");
  // Spreadsheet applications may evaluate cells beginning with these
  // characters as formulas. Prefix them with an apostrophe before quoting.
  const safeText = /^[=+\-@]/.test(text.trim()) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

app.get("/api/admin/subscribers/export", verifyAdmin, async (req, res) => {
  try {
    const subscribers = await readSubscribers();
    const rows = [["email", "date"].map(escapeCsvCell).join(",")];
    subscribers.forEach((s) => {
      rows.push([s.email, s.date].map(escapeCsvCell).join(","));
    });

    const csv = rows.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="subscribers.csv"',
    );
    res.send(csv);
  } catch (error) {
    logError("Export subscribers", error);
    res.status(500).json({ error: "Failed to export subscribers" });
  }
});

// ==========================================
// ADMIN: SETTINGS
// ==========================================

app.post("/api/admin/settings", verifyAdmin, async (req, res) => {
  try {
    const { title, description, password } = req.body;
    const current = await get("SELECT * FROM settings WHERE id = 1");

    const newTitle = title || current?.title || "Essence";
    const newDescription = description || current?.description || "";
    const newHash = password
      ? await bcrypt.hash(password, 10)
      : current?.admin_password_hash;

    await run(
      `INSERT OR REPLACE INTO settings (id, title, description, admin_password_hash) VALUES (1, ?, ?, ?)`,
      [newTitle, newDescription, newHash],
    );

    res.json({ success: true });
  } catch (error) {
    logError("Update settings", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

app.get("/api/admin/settings", verifyAdmin, async (req, res) => {
  try {
    const current = await get("SELECT * FROM settings WHERE id = 1");
    res.json({
      title: current?.title || "Essence",
      description: current?.description || "",
      adminPassword: !!current?.admin_password_hash,
    });
  } catch (err) {
    logError("Get settings", err);
    res.status(500).json({ error: "Failed to read settings" });
  }
});

// ==========================================
// Dynamic RSS feed generated from posts/*.html
// (unchanged — reads static HTML files directly, not DB-dependent)
// ==========================================
app.get("/rss.xml", (req, res) => {
  try {
    const postsDir = path.join(__dirname, "posts");
    if (!fs.existsSync(postsDir)) {
      return res.status(404).send("No posts directory");
    }

    const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".html"));

    const items = files.map((filename) => {
      const fullPath = path.join(postsDir, filename);
      const content = fs.readFileSync(fullPath, "utf8");

      let titleMatch = content.match(/<title>([^<]+)<\/title>/i);
      const title =
        titleMatch && titleMatch[1] ? titleMatch[1].trim() : filename;

      let descMatch = content.match(
        /<meta\s+name=["']description["']\s+content=["']([^"']+)["']\s*\/>/i,
      );
      if (!descMatch) {
        descMatch = content.match(
          /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']\s*\/>/i,
        );
      }
      const description = descMatch && descMatch[1] ? descMatch[1].trim() : "";

      let dateMatch = content.match(/"datePublished"\s*:\s*"([^"]+)"/i);
      let pubDate = dateMatch
        ? new Date(dateMatch[1])
        : fs.statSync(fullPath).birthtime;

      return {
        title,
        link: `https://essence-blog.com/posts/${filename}`,
        description,
        pubDate: new Date(pubDate).toUTCString(),
        guid: `https://essence-blog.com/posts/${filename}`,
      };
    });

    const channelTitle = "Essence";
    const channelLink = "https://essence-blog.com/";
    const channelDesc =
      "A modern blog with insights, stories, and ideas on technology and design.";

    let rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>${channelTitle}</title>\n    <link>${channelLink}</link>\n    <description>${channelDesc}</description>\n    <language>en-us</language>\n    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;

    items.forEach((item) => {
      rss += `\n    <item>\n      <title>${escapeXml(item.title)}</title>\n      <link>${item.link}</link>\n      <description>${escapeXml(item.description)}</description>\n      <pubDate>${item.pubDate}</pubDate>\n      <guid>${item.guid}</guid>\n    </item>\n`;
    });

    rss += "  </channel>\n</rss>";

    res.set("Content-Type", "application/rss+xml");
    res.send(rss);
  } catch (error) {
    logError("RSS generation", error);
    res.status(500).send("Failed to generate RSS");
  }
});

// escapeXml moved to utils.js

// ==========================================
// ANALYTICS & STATS ENDPOINTS
// Events and sessions are persisted in the database; no raw IP addresses are stored.
// ==========================================

const MAX_ANALYTICS_ITEMS = 50;
const MAX_ANALYTICS_TEXT = 500;
const MAX_ANALYTICS_METADATA = 2000;

function normalizeAnalyticsSessionId(value) {
  const sessionId = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(sessionId) ? sessionId : null;
}

function normalizeAnalyticsPage(value) {
  const page = String(value || "").trim();
  return page ? page.slice(0, MAX_ANALYTICS_TEXT) : null;
}

function normalizeAnalyticsMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    return JSON.stringify(value).slice(0, MAX_ANALYTICS_METADATA);
  } catch {
    return null;
  }
}

function normalizeAnalyticsDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration)
    ? Math.max(0, Math.min(Math.round(duration), 86400000))
    : null;
}

app.post("/api/analytics", async (req, res) => {
  try {
    const sessionId = normalizeAnalyticsSessionId(req.body?.sessionId);
    if (!sessionId) {
      return res.status(400).json({ error: "Invalid analytics session" });
    }

    const pageViews = Array.isArray(req.body?.pageViews)
      ? req.body.pageViews.slice(0, MAX_ANALYTICS_ITEMS)
      : [];
    const events = Array.isArray(req.body?.events)
      ? req.body.events.slice(0, MAX_ANALYTICS_ITEMS)
      : [];
    const now = new Date().toISOString();
    const statements = [];

    pageViews.forEach((view) => {
      if (!view || typeof view !== "object") return;
      const page = normalizeAnalyticsPage(view.page);
      if (!page) return;
      statements.push({
        sql: `INSERT INTO analytics_events
          (session_id, event_type, name, page, duration_ms, metadata_json, created_at)
          VALUES (?, 'page_view', 'page_view', ?, ?, NULL, ?)`,
        args: [sessionId, page, normalizeAnalyticsDuration(view.duration), now],
      });
    });

    events.forEach((event) => {
      if (!event || typeof event !== "object") return;
      const name = String(event.name || "").trim().slice(0, 100);
      if (!/^[A-Za-z0-9_.:%-]{1,100}$/.test(name)) return;
      const page = normalizeAnalyticsPage(event.data?.page || event.page);
      statements.push({
        sql: `INSERT INTO analytics_events
          (session_id, event_type, name, page, duration_ms, metadata_json, created_at)
          VALUES (?, 'event', ?, ?, ?, ?, ?)`,
        args: [
          sessionId,
          name,
          page,
          normalizeAnalyticsDuration(event.data?.duration || event.duration),
          normalizeAnalyticsMetadata(event.data || event.data_json),
          now,
        ],
      });
    });

    const pageViewCount = pageViews.filter(
      (view) => view && typeof view === "object" && normalizeAnalyticsPage(view.page),
    ).length;
    const eventCount = statements.length - pageViewCount;
    statements.unshift({
      sql: `INSERT INTO analytics_sessions
        (session_id, first_seen_at, last_seen_at, page_count, event_count)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at,
          page_count = analytics_sessions.page_count + excluded.page_count,
          event_count = analytics_sessions.event_count + excluded.event_count`,
      args: [sessionId, now, now, pageViewCount, eventCount],
    });

    await transaction(statements);
    res.json({
      success: true,
      accepted: { pageViews: pageViewCount, events: eventCount },
    });
  } catch (error) {
    logError("Analytics", error);
    res.status(500).json({ error: "Failed to record analytics" });
  }
});

app.get("/api/admin/stats", verifyAdmin, async (req, res) => {
  try {
    const activeSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const [
      posts,
      comments,
      subscribers,
      viewSumRow,
      likeSumRow,
      pageViewTrend,
      activeSessionsRow,
      topViewRows,
      topLikeRows,
    ] = await Promise.all([
      readPosts(),
      readComments(),
      readSubscribers(),
      get("SELECT COALESCE(SUM(views), 0) AS total FROM post_views"),
      get("SELECT COALESCE(SUM(likes), 0) AS total FROM post_likes"),
      getPageViewTrend(),
      get(
        "SELECT COUNT(*) AS count FROM analytics_sessions WHERE last_seen_at >= ?",
        [activeSince],
      ),
      all("SELECT post_id, views FROM post_views ORDER BY views DESC LIMIT 5"),
      all("SELECT post_id, likes FROM post_likes ORDER BY likes DESC LIMIT 5"),
    ]);

    const postTitleById = {};
    posts.forEach((p) => {
      postTitleById[p.id] = p.title;
    });

    const topPostsByViews = topViewRows
      .filter((r) => r.views > 0)
      .map((r) => ({
        postId: r.post_id,
        title: postTitleById[r.post_id] || `Post ${r.post_id}`,
        views: r.views,
      }));

    const topPostsByLikes = topLikeRows
      .filter((r) => r.likes > 0)
      .map((r) => ({
        postId: r.post_id,
        title: postTitleById[r.post_id] || `Post ${r.post_id}`,
        likes: r.likes,
      }));

    const stats = {
      totalPosts: posts.length,
      totalComments: comments.length,
      totalSubscribers: subscribers.length,
      totalViews: viewSumRow ? viewSumRow.total : 0,
      totalLikes: likeSumRow ? likeSumRow.total : 0,
      activeSessions: activeSessionsRow?.count || 0,
      recentPosts: posts.slice(0, 5),
      recentComments: comments.slice(0, 5),
      topCategories: getTopCategories(posts),
      topPostsByViews,
      topPostsByLikes,
      pageViewTrend,
    };

    res.json(stats);
  } catch (error) {
    logError("Admin stats", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.get("/api/admin/analytics", verifyAdmin, async (req, res) => {
  try {
    const activeSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const [pageRows, eventRows, totals, activeSessionsRow] = await Promise.all([
      all(`SELECT COALESCE(page, '(unknown)') AS page, COUNT(*) AS count
           FROM analytics_events
           WHERE event_type = 'page_view'
           GROUP BY page
           ORDER BY count DESC
           LIMIT 100`),
      all(`SELECT name, COUNT(*) AS count
           FROM analytics_events
           WHERE event_type = 'event'
           GROUP BY name
           ORDER BY count DESC
           LIMIT 100`),
      get(`SELECT
             SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views,
             SUM(CASE WHEN event_type = 'event' THEN 1 ELSE 0 END) AS events
           FROM analytics_events`),
      get(
        "SELECT COUNT(*) AS count FROM analytics_sessions WHERE last_seen_at >= ?",
        [activeSince],
      ),
    ]);

    const pageViewsByPage = Object.fromEntries(
      pageRows.map((row) => [row.page, Number(row.count) || 0]),
    );
    const eventsByType = Object.fromEntries(
      eventRows.map((row) => [row.name, Number(row.count) || 0]),
    );

    res.json({
      pageViews: Number(totals?.page_views) || 0,
      pageViewsByPage,
      events: Number(totals?.events) || 0,
      eventsByType,
      activeSessions: Number(activeSessionsRow?.count) || 0,
      topPages: pageRows.map((row) => ({
        page: row.page,
        count: Number(row.count) || 0,
      })),
    });
  } catch (error) {
    logError("Admin analytics", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

function getTopCategories(posts) {
  const categories = {};
  posts.forEach((post) => {
    if (post.category) {
      categories[post.category] = (categories[post.category] || 0) + 1;
    }
  });

  return Object.entries(categories)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

async function getPageViewTrend() {
  const rows = await all(`SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS views
                          FROM analytics_events
                          WHERE event_type = 'page_view'
                          GROUP BY substr(created_at, 1, 10)
                          ORDER BY date DESC
                          LIMIT 30`);
  return rows
    .map((row) => ({ date: row.date, views: Number(row.views) || 0 }))
    .reverse();
}

app.listen(PORT, HOST, () => {
  console.log(`Blog server running on http://${HOST}:${PORT}`);
  console.log(`Admin dashboard: http://${HOST}:${PORT}/admin.html`);
});
