import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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

// Simple logger
function logError(context, error) {
  console.error(`[ERROR] ${context}:`, error.message);
}

function logInfo(context, message) {
  console.log(`[INFO] ${context}: ${message}`);
}

// Input sanitization
function sanitizeString(str) {
  if (typeof str !== "string") return "";
  return str.trim().substring(0, 5000); // Cap at 5000 chars
}

function sanitizeEmail(email) {
  if (typeof email !== "string") return "";
  const trimmed = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : "";
}

// Rate limiting (simple in-memory)
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

// Rate limit middleware
function rateLimitMiddleware(req, res, next) {
  const key = `${req.method}-${req.path}-${req.ip}`;
  // Allow 100 requests per minute for normal browsing
  if (!checkRateLimit(key, 100, 60000)) {
    return res
      .status(429)
      .json({ error: "Too many requests, please try again later" });
  }
  next();
}

app.use(rateLimitMiddleware);

// Database file paths
const commentsFile = path.join(__dirname, "data", "comments.json");
const analyticsFile = path.join(__dirname, "data", "analytics.json");
const subscribersFile = path.join(__dirname, "data", "subscribers.json");
const postsFile = path.join(__dirname, "data", "posts.json");
const usersFile = path.join(__dirname, "data", "users.json");
const settingsFile = path.join(__dirname, "data", "settings.json");

// JWT Secret
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

// Initialize data directory
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize data files if they don't exist
function initializeDataFiles() {
  if (!fs.existsSync(commentsFile)) {
    fs.writeFileSync(commentsFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(analyticsFile)) {
    fs.writeFileSync(
      analyticsFile,
      JSON.stringify(
        {
          postViews: {},
          totalLikes: 0,
          totalComments: 0,
        },
        null,
        2,
      ),
    );
  }
  if (!fs.existsSync(subscribersFile)) {
    fs.writeFileSync(subscribersFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(postsFile)) {
    fs.writeFileSync(postsFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(settingsFile)) {
    const generatedPassword =
      process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString("hex");

    if (!process.env.ADMIN_PASSWORD) {
      console.warn(
        "[WARN] No ADMIN_PASSWORD env var set. Generated a random admin password " +
          "for first run — check data/settings.json to retrieve it, then set " +
          "ADMIN_PASSWORD in your environment and rotate it.",
      );
    }

    fs.writeFileSync(
      settingsFile,
      JSON.stringify(
        {
          title: "Essence",
          description: "A modern blog",
          adminPassword: generatedPassword,
        },
        null,
        2,
      ),
    );
  }
}

initializeDataFiles();

// Helper functions for subscribers (migrate simple array -> objects with date)
function readSubscribers() {
  try {
    const raw = fs.readFileSync(subscribersFile, "utf8");
    const parsed = JSON.parse(raw || "[]");
    // If old format (array of strings), migrate to objects
    if (parsed.length > 0 && typeof parsed[0] === "string") {
      const migrated = parsed.map((email) => ({
        email,
        date: new Date().toISOString(),
      }));
      fs.writeFileSync(subscribersFile, JSON.stringify(migrated, null, 2));
      return migrated;
    }
    return parsed;
  } catch (err) {
    return [];
  }
}

function writeSubscribers(list) {
  fs.writeFileSync(subscribersFile, JSON.stringify(list, null, 2));
}

// Email configuration (using test credentials - configure with real service)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "your-email@gmail.com",
    pass: process.env.EMAIL_PASSWORD || "your-app-password",
  },
});

// API: Get all comments for a post
app.get("/api/comments/:postId", (req, res) => {
  try {
    const comments = JSON.parse(fs.readFileSync(commentsFile, "utf8"));
    const postComments = comments.filter((c) => c.postId === req.params.postId);
    res.json(postComments);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// API: Post a new comment
app.post("/api/comments", (req, res) => {
  try {
    const { postId, name, text } = req.body;

    // Validate input
    const sanitizedPostId = sanitizeString(postId);
    const sanitizedName = sanitizeString(name || "Anonymous");
    const sanitizedText = sanitizeString(text);

    if (!sanitizedPostId || !sanitizedText || sanitizedText.length < 2) {
      return res.status(400).json({
        error:
          "Missing or invalid required fields (name, text required, min 2 chars)",
      });
    }

    // Rate limiting per IP for comments
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

    // If authenticated, get user info
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
        userName = decoded.username;
      } catch (e) {
        logError("Token validation", e);
        // Invalid token, treat as anonymous
      }
    }

    const comments = JSON.parse(fs.readFileSync(commentsFile, "utf8"));
    const newComment = {
      id: uuidv4(),
      postId: sanitizedPostId,
      userId,
      name: userName,
      text: sanitizedText,
      timestamp: new Date().toISOString(),
    };

    comments.push(newComment);
    fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2));

    // Update analytics
    const analytics = JSON.parse(fs.readFileSync(analyticsFile, "utf8"));
    analytics.totalComments++;
    fs.writeFileSync(analyticsFile, JSON.stringify(analytics, null, 2));

    // Update user comment count if authenticated
    if (userId) {
      const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
      const userIndex = users.findIndex((u) => u.id === userId);
      if (userIndex !== -1) {
        users[userIndex].comments++;
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
      }
    }

    logInfo("Comment", `Posted on post ${sanitizedPostId}`);
    res.status(201).json(newComment);
  } catch (error) {
    logError("Post comment", error);
    res.status(500).json({ error: "Failed to post comment" });
  }
});

// API: Get all comments (admin only)
app.get("/api/admin/comments", verifyAdmin, (req, res) => {
  try {
    const comments = JSON.parse(fs.readFileSync(commentsFile, "utf8"));
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// API: Delete a comment (admin only)
app.delete("/api/admin/comments/:id", verifyAdmin, (req, res) => {
  try {
    const { id } = req.params;
    let comments = JSON.parse(fs.readFileSync(commentsFile, "utf8"));
    const index = comments.findIndex((c) => c.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Comment not found" });
    }

    comments.splice(index, 1);
    fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2));

    // Update analytics
    const analytics = JSON.parse(fs.readFileSync(analyticsFile, "utf8"));
    analytics.totalComments = Math.max(0, analytics.totalComments - 1);
    fs.writeFileSync(analyticsFile, JSON.stringify(analytics, null, 2));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

// API: Get analytics
app.get("/api/analytics", (req, res) => {
  try {
    const analytics = JSON.parse(fs.readFileSync(analyticsFile, "utf8"));
    const subscribers = JSON.parse(fs.readFileSync(subscribersFile, "utf8"));

    res.json({
      ...analytics,
      totalSubscribers: subscribers.length,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// ==========================================
// POSTS: Public list and admin create/delete
// ==========================================

function readPosts() {
  try {
    const raw = fs.readFileSync(postsFile, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    return [];
  }
}

function writePosts(list) {
  fs.writeFileSync(postsFile, JSON.stringify(list, null, 2));
}

function readComments() {
  try {
    const raw = fs.readFileSync(commentsFile, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    return [];
  }
}

// Public: list posts metadata
app.get("/api/posts", (req, res) => {
  try {
    const posts = readPosts();
    res.json(posts);
  } catch (error) {
    logError("Get posts", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Public: search posts by title or content
app.get("/api/posts/search/:query", (req, res) => {
  try {
    let query = decodeURIComponent(req.params.query || "").toLowerCase();
    if (query.length < 2) {
      return res
        .status(400)
        .json({ error: "Search query must be at least 2 characters" });
    }

    query = sanitizeString(query);
    const posts = readPosts();

    const results = posts.filter(
      (post) =>
        post.title.toLowerCase().includes(query) ||
        (post.excerpt && post.excerpt.toLowerCase().includes(query)) ||
        (post.category && post.category.toLowerCase().includes(query)),
    );

    logInfo("Search", `Query: "${query}", Results: ${results.length}`);
    res.json(results);
  } catch (error) {
    logError("Search posts", error);
    res.status(500).json({ error: "Failed to search posts" });
  }
});

// Public: get popular tags/categories
app.get("/api/tags/popular", (req, res) => {
  try {
    const posts = readPosts();
    const tagCounts = {};

    // Count categories across all posts
    posts.forEach((post) => {
      if (post.category) {
        const tags = post.category.split(",").map((t) => t.trim());
        tags.forEach((tag) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // Sort by count descending and limit to top 10
    const popularTags = Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    logInfo("Popular Tags", `Found ${popularTags.length} tags`);
    res.json(popularTags);
  } catch (error) {
    logError("Popular tags", error);
    res.status(500).json({ error: "Failed to fetch popular tags" });
  }
});

// Admin: create post (persist metadata and write HTML file)
app.post("/api/admin/posts", verifyAdmin, (req, res) => {
  try {
    const { id, title, category, content, date } = req.body;
    if (!id || !title || !content) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const posts = readPosts();

    const postMeta = {
      id,
      title,
      category: category || "Uncategorized",
      date: date || new Date().toISOString(),
      slug: id,
      excerpt: (content || "").slice(0, 160),
    };

    posts.unshift(postMeta);
    writePosts(posts);

    // Ensure posts directory exists
    const postsDir = path.join(__dirname, "posts");
    if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

    // Build a simple HTML post file
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
        <p class="meta">${new Date(postMeta.date).toLocaleString()} • ${escapeXml(postMeta.category)}</p>
      </header>
      <section class="content">
        ${content}
      </section>
    </article>
    <script src="/script.js" defer></script>
  </body>
</html>`;

    fs.writeFileSync(filepath, html, "utf8");

    res.json({ success: true, id, url: `/posts/${filename}` });
  } catch (error) {
    console.error("Create post error:", error);
    res.status(500).json({ error: "Failed to save post" });
  }
});

// Admin: delete post (remove metadata and file)
app.delete("/api/admin/posts/:id", verifyAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const posts = readPosts();
    const idx = posts.findIndex((p) => p.id === id || p.slug === id);
    if (idx === -1) return res.status(404).json({ error: "Post not found" });

    const removed = posts.splice(idx, 1)[0];
    writePosts(posts);

    const postsDir = path.join(__dirname, "posts");
    const filepath = path.join(postsDir, `${removed.slug}.html`);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    logInfo("Delete post", `Post "${removed.title}" deleted`);
    res.json({ success: true });
  } catch (error) {
    logError("Delete post", error);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// Admin: edit post metadata and content
app.put("/api/admin/posts/:id", verifyAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, content } = req.body;

    // Validate input
    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const sanitizedTitle = sanitizeString(title);
    const sanitizedCategory = sanitizeString(category || "Uncategorized");
    const sanitizedContent = sanitizeString(content);

    if (!sanitizedTitle || !sanitizedContent) {
      return res.status(400).json({ error: "Invalid title or content" });
    }

    const posts = readPosts();
    const postIndex = posts.findIndex((p) => p.id === id || p.slug === id);

    if (postIndex === -1) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Update metadata
    const post = posts[postIndex];
    post.title = sanitizedTitle;
    post.category = sanitizedCategory;
    post.excerpt = sanitizedContent.slice(0, 160);
    post.updatedAt = new Date().toISOString();

    writePosts(posts);

    // Update HTML file
    const postsDir = path.join(__dirname, "posts");
    const filename = `${post.slug}.html`;
    const filepath = path.join(postsDir, filename);
    const metaDescription = post.excerpt.replace(/"/g, "'");
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeXml(post.title)}</title>
    <meta name="description" content="${escapeXml(metaDescription)}" />
    <meta property="og:title" content="${escapeXml(post.title)}" />
    <meta property="og:description" content="${escapeXml(metaDescription)}" />
    <script type="application/ld+json">{ "@context": "https://schema.org", "@type": "BlogPosting", "headline": "${escapeXml(post.title)}", "datePublished": "${post.date}" }</script>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <article class="post">
      <header>
        <h1>${escapeXml(post.title)}</h1>
        <p class="meta">${new Date(post.date).toLocaleString()} • ${escapeXml(post.category)}</p>
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

// API: Record page view
app.post("/api/analytics/view/:postId", (req, res) => {
  try {
    const analytics = JSON.parse(fs.readFileSync(analyticsFile, "utf8"));
    const postId = req.params.postId;

    if (!analytics.postViews[postId]) {
      analytics.postViews[postId] = 0;
    }
    analytics.postViews[postId]++;

    fs.writeFileSync(analyticsFile, JSON.stringify(analytics, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to record view" });
  }
});

// API: Like a post
app.post("/api/analytics/like", (req, res) => {
  try {
    const analytics = JSON.parse(fs.readFileSync(analyticsFile, "utf8"));
    analytics.totalLikes++;
    fs.writeFileSync(analyticsFile, JSON.stringify(analytics, null, 2));
    res.json({ totalLikes: analytics.totalLikes });
  } catch (error) {
    res.status(500).json({ error: "Failed to record like" });
  }
});

// API: Subscribe to newsletter
app.post("/api/subscribe", async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    // Rate limiting per IP for subscriptions
    const rateLimitKey = `subscribe-${req.ip}`;
    if (!checkRateLimit(rateLimitKey, 3, 3600000)) {
      // 3 per hour
      return res.status(429).json({
        error: "Too many subscription attempts, please try again later",
      });
    }

    // Read subscribers (migrates old format automatically)
    let subscribers = readSubscribers();

    // Check if already subscribed
    if (subscribers.find((s) => s.email === sanitizedEmail)) {
      return res.status(400).json({ error: "Email already subscribed" });
    }

    const subscriber = {
      email: sanitizedEmail,
      date: new Date().toISOString(),
    };
    subscribers.push(subscriber);
    writeSubscribers(subscribers);

    logInfo("Subscribe", `New subscriber: ${sanitizedEmail}`);

    // Optionally add to Mailchimp if configured
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

    // Send confirmation email via SendGrid if configured, otherwise nodemailer transporter
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    const sendConfirmation = async () => {
      const subject = "Welcome to the Essence newsletter!";
      const html = `
        <h2>Welcome to the Blog!</h2>
        <p>Thanks for subscribing. You'll receive updates when new posts are published.</p>
        <p>— Efe</p>
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

function getAdminPassword() {
  try {
    const current = JSON.parse(fs.readFileSync(settingsFile, "utf8") || "{}");
    return current.adminPassword || process.env.ADMIN_PASSWORD || null;
  } catch {
    return process.env.ADMIN_PASSWORD || null;
  }
}

// ==========================================
// USER AUTHENTICATION
// ==========================================

// Register new user
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    // Validation
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

    // Check if user already exists
    const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    if (users.find((u) => u.email === email || u.username === username)) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = {
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      bio: "",
      avatar: null,
      posts: 0,
      comments: 0,
    };

    users.push(newUser);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    // Generate token
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
    res.status(500).json({ error: "Failed to register user" });
  }
});

// Login user
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    const user = users.find((u) => u.email === email);

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

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
    res.status(500).json({ error: "Failed to login" });
  }
});

// Validate token
app.post("/api/auth/validate", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    const user = users.find((u) => u.id === decoded.id);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

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

// Get user profile
app.get("/api/users/:username", (req, res) => {
  try {
    const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    const user = users.find((u) => u.username === req.params.username);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

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
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

// Update user profile
app.put("/api/users/profile/:id", (req, res) => {
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
    const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    const userIndex = users.findIndex((u) => u.id === req.params.id);

    if (userIndex === -1) {
      return res.status(404).json({ error: "User not found" });
    }

    users[userIndex].bio = bio || users[userIndex].bio;
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    res.json({
      success: true,
      user: {
        id: users[userIndex].id,
        username: users[userIndex].username,
        email: users[userIndex].email,
        bio: users[userIndex].bio,
        avatar: users[userIndex].avatar,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

// Rate limit admin login attempts harder than general traffic (brute-force protection)
app.post("/api/admin/login", (req, res) => {
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

    let stored;
    try {
      const settingsRaw = fs.readFileSync(settingsFile, "utf8");
      const settings = JSON.parse(settingsRaw || "{}");
      stored = settings.adminPassword || getAdminPassword();
    } catch {
      stored = getAdminPassword();
    }

    if (!stored) {
      logError("Admin login", new Error("No admin password configured"));
      return res.status(500).json({ error: "Admin login is not configured" });
    }

    // Constant-time comparison to avoid leaking password length/content via timing
    const passwordBuf = Buffer.from(password);
    const storedBuf = Buffer.from(stored);
    const isMatch =
      passwordBuf.length === storedBuf.length &&
      crypto.timingSafeEqual(passwordBuf, storedBuf);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Issue a real, short-lived, signed session token instead of a static string
    const token = jwt.sign({ role: "admin" }, JWT_SECRET, {
      expiresIn: "12h",
    });

    res.json({ token });
  } catch (err) {
    logError("Admin login", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Middleware to check admin session token
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

app.get("/api/admin/subscribers", verifyAdmin, (req, res) => {
  try {
    const subscribers = readSubscribers();
    const subscribersData = subscribers.map((s, index) => ({
      email: s.email,
      date: s.date || new Date().toISOString(),
      id: index,
    }));
    res.json(subscribersData);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch subscribers" });
  }
});

app.delete("/api/admin/subscribers/:id", verifyAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const subscribers = readSubscribers();
    const idx = parseInt(id);
    if (isNaN(idx) || idx < 0 || idx >= subscribers.length) {
      return res.status(404).json({ error: "Subscriber not found" });
    }
    subscribers.splice(idx, 1);
    writeSubscribers(subscribers);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete subscriber" });
  }
});

// Export subscribers as CSV (admin only)
app.get("/api/admin/subscribers/export", verifyAdmin, (req, res) => {
  try {
    const subscribers = readSubscribers();
    const rows = ["email,date"];
    subscribers.forEach((s) => {
      const email = typeof s === "string" ? s : s.email || "";
      const date = s && s.date ? s.date : new Date().toISOString();
      rows.push(`${String(email).replace(/,/g, "")},${date}`);
    });

    const csv = rows.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="subscribers.csv"',
    );
    res.send(csv);
  } catch (error) {
    console.error("Export subscribers error:", error);
    res.status(500).json({ error: "Failed to export subscribers" });
  }
});

// ==========================================
// ADMIN: SETTINGS
// ==========================================

app.post("/api/admin/settings", verifyAdmin, (req, res) => {
  try {
    const { title, description, password } = req.body;

    const current = JSON.parse(fs.readFileSync(settingsFile, "utf8") || "{}");
    const updated = {
      title: title || current.title || "Essence",
      description: description || current.description || "",
      adminPassword: password
        ? password
        : current.adminPassword || getAdminPassword(),
    };

    fs.writeFileSync(settingsFile, JSON.stringify(updated, null, 2), "utf8");

    // No in-memory cache to update — getAdminPassword() always reads
    // settingsFile fresh, so the new password takes effect on the next login.

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// Admin: get current settings
app.get("/api/admin/settings", verifyAdmin, (req, res) => {
  try {
    const current = JSON.parse(fs.readFileSync(settingsFile, "utf8") || "{}");
    res.json({
      title: current.title || "Essence",
      description: current.description || "",
      adminPassword: !!current.adminPassword,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to read settings" });
  }
});

// Dynamic RSS feed generated from posts/*.html
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

      // Extract title
      let titleMatch = content.match(/<title>([^<]+)<\/title>/i);
      const title =
        titleMatch && titleMatch[1] ? titleMatch[1].trim() : filename;

      // Try meta description
      let descMatch = content.match(
        /<meta\s+name=["']description["']\s+content=["']([^"']+)["']\s*\/>/i,
      );
      if (!descMatch) {
        // fallback to og:description
        descMatch = content.match(
          /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']\s*\/>/i,
        );
      }
      const description = descMatch && descMatch[1] ? descMatch[1].trim() : "";

      // Try to find a datePublished in JSON-LD
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
    console.error("Failed to generate RSS:", error);
    res.status(500).send("Failed to generate RSS");
  }
});

function escapeXml(unsafe) {
  if (!unsafe) return "";
  return unsafe.replace(/[<>&'\"]/g, function (c) {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
    }
  });
}

// ==========================================
// ANALYTICS & STATS ENDPOINTS
// ==========================================

// Store analytics data in memory (in production, use a database)
const analyticsStore = {
  pageViews: [],
  events: [],
  sessions: new Map(),
};

// Public: submit analytics
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

// Admin: get dashboard statistics
app.get("/api/admin/stats", verifyAdmin, (req, res) => {
  try {
    const posts = readPosts();
    const comments = readComments();
    const subscribers = readSubscribers();

    // Calculate stats
    const stats = {
      totalPosts: posts.length,
      totalComments: comments.length,
      totalSubscribers: subscribers.length,
      totalViews: analyticsStore.pageViews.length,
      activeSessions: analyticsStore.sessions.size,
      viewChange: Math.floor(Math.random() * 40 - 10), // Demo data
      recentPosts: posts.slice(0, 5),
      recentComments: comments.slice(0, 5),
      topCategories: getTopCategories(posts),
      pageViewTrend: getPageViewTrend(),
    };

    res.json(stats);
  } catch (error) {
    logError("Admin stats", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Admin: get analytics details
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

// Helper: get top categories
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

// Helper: get page view trend (demo)
function getPageViewTrend() {
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    trend.push({
      date: date.toISOString().split("T")[0],
      views: Math.floor(Math.random() * 100) + 20,
    });
  }
  return trend;
}

// Public: get related posts by category
app.get("/api/posts/related/:category", (req, res) => {
  try {
    const { category } = req.params;
    const posts = readPosts();

    const related = posts.filter((p) => p.category === category).slice(0, 3);

    if (related.length === 0) {
      return res.json(posts.slice(0, 3)); // Return random posts if no related found
    }

    res.json(related);
  } catch (error) {
    logError("Related posts", error);
    res.status(500).json({ error: "Failed to fetch related posts" });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Blog server running on http://${HOST}:${PORT}`);
  console.log(`Admin dashboard: http://${HOST}:${PORT}/admin.html`);
});
