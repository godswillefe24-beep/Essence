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
import { all, get, run } from "./db.js";
import {
  sanitizeString,
  sanitizeEmail,
  escapeXml,
  buildPagination,
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
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

import chatRouter from "./routes/chat.js";
app.use("/api/chat", chatRouter);

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

// Strip script tags, iframes, inline event handlers, and javascript: URLs
// from admin-supplied HTML before writing post files.
function stripDangerousHtml(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function sanitizePostContent(content) {
  return stripDangerousHtml(sanitizeString(content));
}

// Rate limiting (simple in-memory — unrelated to persistent storage, left as-is)
const rateLimitStore = new Map();
function checkRateLimit(key, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimitStore.get(key) || {
    count: 0,
    resetTime: now + windowMs,
  };

  if (now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  rateLimitStore.set(key, record);
  return true;
}

function rateLimitMiddleware(req, res, next) {
  const key = `${req.method}-${req.path}-${req.ip}`;
  if (!checkRateLimit(key, 100, 60000)) {
    return res
      .status(429)
      .json({ error: "Too many requests, please try again later" });
  }
  next();
}

app.use(rateLimitMiddleware);

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

async function readPosts() {
  return all("SELECT * FROM posts ORDER BY date DESC");
}

function mapComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    name: row.name,
    text: row.text,
    timestamp: row.timestamp,
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
app.post("/api/comments", async (req, res) => {
  try {
    const { postId, name, text } = req.body;

    const sanitizedPostId = sanitizeString(postId);
    const sanitizedName = sanitizeString(name || "Anonymous");
    const sanitizedText = sanitizeString(text);

    if (!sanitizedPostId || !sanitizedText || sanitizedText.length < 2) {
      return res.status(400).json({
        error:
          "Missing or invalid required fields (name, text required, min 2 chars)",
      });
    }

    const rateLimitKey = `comment-${req.ip}`;
    if (!checkRateLimit(rateLimitKey, 5, 60000)) {
      return res
        .status(429)
        .json({ error: "Too many comments, please wait before posting again" });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

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
    };

    await run(
      `INSERT INTO comments (id, post_id, user_id, name, text, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        newComment.id,
        newComment.postId,
        newComment.userId,
        newComment.name,
        newComment.text,
        newComment.timestamp,
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

// API: Get all comments (admin only)
app.get("/api/admin/comments", verifyAdmin, async (req, res) => {
  try {
    res.json(await readComments());
  } catch (error) {
    logError("Admin get comments", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// API: Delete a comment (admin only)
app.delete("/api/admin/comments/:id", verifyAdmin, async (req, res) => {
  try {
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
      `SELECT * FROM posts ${whereClause} ORDER BY date DESC LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset],
    );

    res.json({ posts, pagination });
  } catch (error) {
    logError("Get posts", error);
    res.status(500).json({ error: "Failed to fetch posts" });
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
      `SELECT * FROM posts 
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
    const { id, title, category, content, date } = req.body;
    if (!id || !title || !content) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const sanitizedTitle = sanitizeString(title);
    const sanitizedCategory = sanitizeString(category || "Uncategorized");
    const sanitizedContent = sanitizePostContent(content);

    if (!sanitizedTitle || !sanitizedContent) {
      return res.status(400).json({ error: "Invalid title or content" });
    }

    const postMeta = {
      id,
      title: sanitizedTitle,
      category: sanitizedCategory,
      date: date || new Date().toISOString(),
      slug: id,
      excerpt: sanitizedContent.slice(0, 160),
    };

    await run(
      `INSERT OR REPLACE INTO posts (id, slug, title, category, date, excerpt, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        postMeta.id,
        postMeta.slug,
        postMeta.title,
        postMeta.category,
        postMeta.date,
        postMeta.excerpt,
        new Date().toISOString(),
      ],
    );

    const postsDir = path.join(__dirname, "posts");
    if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

    const filename = `${postMeta.slug}.html`;
    const filepath = path.join(postsDir, filename);
    const metaDescription = postMeta.excerpt.replace(/"/g, "'");
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeXml(postMeta.title)}</title>
    <meta name="description" content="${escapeXml(metaDescription)}" />
    <meta property="og:title" content="${escapeXml(postMeta.title)}" />
    <meta property="og:description" content="${escapeXml(metaDescription)}" />
    <script type="application/ld+json">{ "@context": "https://schema.org", "@type": "BlogPosting", "headline": "${escapeXml(postMeta.title)}", "datePublished": "${postMeta.date}" }</script>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <article class="post">
      <header>
        <h1>${escapeXml(postMeta.title)}</h1>
        <p class="meta">${new Date(postMeta.date).toLocaleString()} \u2022 ${escapeXml(postMeta.category)}</p>
      </header>
      <section class="content">
        ${sanitizedContent}
      </section>
    </article>
    <script src="/script.js" defer></script>
  </body>
</html>`;

    fs.writeFileSync(filepath, html, "utf8");

    res.json({ success: true, id, url: `/posts/${filename}` });
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
      `UPDATE posts SET title = ?, category = ?, excerpt = ?, updated_at = ? WHERE id = ?`,
      [
        sanitizedTitle,
        sanitizedCategory,
        excerpt,
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
app.post("/api/subscribe", async (req, res) => {
  try {
    const { email } = req.body;

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const rateLimitKey = `subscribe-${req.ip}`;
    if (!checkRateLimit(rateLimitKey, 3, 3600000)) {
      return res.status(429).json({
        error: "Too many subscription attempts, please try again later",
      });
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

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }
    if (!email.includes("@")) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const existing = await get(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [email, username],
    );
    if (existing) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: crypto.randomUUID(),
      username,
      email,
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

    res.status(201).json({
      success: true,
      token,
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

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const row = await get("SELECT * FROM users WHERE email = ?", [email]);
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

    res.json({
      success: true,
      token,
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

app.post("/api/auth/validate", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

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
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

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

app.post("/api/admin/login", async (req, res) => {
  const { password } = req.body;

  const rateLimitKey = `admin-login-${req.ip}`;
  if (!checkRateLimit(rateLimitKey, 5, 60000)) {
    return res.status(429).json({
      error: "Too many login attempts, please wait before trying again",
    });
  }

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
    res.json({ token });
  } catch (err) {
    logError("Admin login", err);
    res.status(500).json({ error: "Login failed" });
  }
});

function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

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

app.get("/api/admin/subscribers/export", verifyAdmin, async (req, res) => {
  try {
    const subscribers = await readSubscribers();
    const rows = ["email,date"];
    subscribers.forEach((s) => {
      rows.push(`${String(s.email).replace(/,/g, "")},${s.date}`);
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
// (in-memory session/event tracking — was already ephemeral by design
// before this migration, not part of persistent storage, left unchanged)
// ==========================================

const analyticsStore = {
  pageViews: [],
  events: [],
  sessions: new Map(),
};

app.post("/api/analytics", (req, res) => {
  try {
    const { sessionId, pageViews, events } = req.body;

    if (pageViews) {
      analyticsStore.pageViews.push(...pageViews);
    }
    if (events) {
      analyticsStore.events.push(...events);
    }
    if (sessionId) {
      analyticsStore.sessions.set(sessionId, {
        createdAt: new Date().toISOString(),
        pageCount: pageViews?.length || 0,
        eventCount: events?.length || 0,
      });
    }

    res.json({ success: true, message: "Analytics recorded" });
  } catch (error) {
    logError("Analytics", error);
    res.status(500).json({ error: "Failed to record analytics" });
  }
});

app.get("/api/admin/stats", verifyAdmin, async (req, res) => {
  try {
    const [
      posts,
      comments,
      subscribers,
      viewSumRow,
      pageViewTrend,
      topViewRows,
      topLikeRows,
    ] = await Promise.all([
      readPosts(),
      readComments(),
      readSubscribers(),
      get("SELECT COALESCE(SUM(views), 0) AS total FROM post_views"),
      getPageViewTrend(),
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
      activeSessions: analyticsStore.sessions.size,
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

app.get("/api/admin/analytics", verifyAdmin, (req, res) => {
  try {
    const pageViewsByPage = {};
    analyticsStore.pageViews.forEach((view) => {
      pageViewsByPage[view.page] = (pageViewsByPage[view.page] || 0) + 1;
    });

    const eventsByType = {};
    analyticsStore.events.forEach((event) => {
      eventsByType[event.name] = (eventsByType[event.name] || 0) + 1;
    });

    res.json({
      pageViews: analyticsStore.pageViews.length,
      pageViewsByPage,
      events: analyticsStore.events.length,
      eventsByType,
      activeSessions: analyticsStore.sessions.size,
      topPages: Object.entries(pageViewsByPage)
        .map(([page, count]) => ({ page, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
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
  const row = await get(
    "SELECT COALESCE(SUM(views), 0) AS total FROM post_views",
  );
  const total = row ? row.total : 0;
  const today = new Date().toISOString().split("T")[0];
  // Per-post view counts are cumulative (no daily breakdown stored yet).
  return [{ date: today, views: total }];
}

app.listen(PORT, HOST, () => {
  console.log(`Blog server running on http://${HOST}:${PORT}`);
  console.log(`Admin dashboard: http://${HOST}:${PORT}/admin.html`);
});
