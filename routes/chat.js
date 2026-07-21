// routes/chat.js  (ES Module version — matches "type": "module" in package.json)
//
// AI chatbot endpoint for Essence, powered by Groq's free API
// (open-source models: Llama 3.3, hosted for free at api.groq.com).
//
// Setup:
//   1. npm install express-rate-limit   (skip if already installed)
//   2. Get a free API key: https://console.groq.com/keys (no credit card)
//   3. Add to your .env:  GROQ_API_KEY=gsk_xxxxxxxxxxxx
//   4. In server.js:
//        import chatRouter from './routes/chat.js';
//        app.use('/api/chat', chatRouter);

import express from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ---- Config -----------------------------------------------------------

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const POSTS_PATH = path.join(__dirname, "..", "data", "posts.json");

// Groq's free tier is ~30 req/min org-wide. We rate-limit our own endpoint
// more conservatively per-IP so one visitor can't exhaust your daily quota
// (free tier is roughly 1,000 requests/day as of mid-2026 — check
// console.groq.com for your account's current limits).
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 8, // 8 messages per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "You're sending messages a bit fast — please wait a moment.",
  },
});

// ---- Lightweight retrieval (no vector DB needed for a JSON-file blog) --

function loadPosts() {
  try {
    const raw = fs.readFileSync(POSTS_PATH, "utf-8");
    const data = JSON.parse(raw);
    // Support either { posts: [...] } or a bare array
    return Array.isArray(data) ? data : data.posts || [];
  } catch (err) {
    console.error(
      "chat.js: could not load posts.json for retrieval:",
      err.message,
    );
    return [];
  }
}

// Pull whatever text fields exist on a post, defensively — adjust these
// field names if your posts.json uses different keys.
function getPostText(post) {
  const title = post.title || "";
  const body = post.content || post.body || post.excerpt || post.summary || "";
  return { title, body };
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

// Simple TF-style keyword scoring: title matches weighted 3x over body matches.
function scorePost(post, queryTerms) {
  const { title, body } = getPostText(post);
  const titleTokens = tokenize(title);
  const bodyTokens = tokenize(body);

  let score = 0;
  for (const term of queryTerms) {
    score += titleTokens.filter((t) => t.includes(term)).length * 3;
    score += bodyTokens.filter((t) => t.includes(term)).length;
  }
  return score;
}

function getRelevantPosts(query, limit = 3) {
  const posts = loadPosts();
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || posts.length === 0) return [];

  const scored = posts
    .map((post) => ({ post, score: scorePost(post, queryTerms) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ post }) => {
    const { title, body } = getPostText(post);
    return {
      title,
      slug: post.slug || post.id || "",
      excerpt: body.slice(0, 500),
    };
  });
}

// ---- Prompt construction -----------------------------------------------

function buildSystemPrompt(relevantPosts) {
  let prompt =
    `You are a friendly, concise assistant embedded on a blog called Essence. ` +
    `Answer visitor questions helpfully. If the visitor asks about the blog's content and ` +
    `relevant excerpts are provided below, ground your answer in them and mention which post ` +
    `it's from. If no excerpts are relevant, or the question is general, answer normally as a ` +
    `helpful assistant. Keep answers under ~120 words unless asked for more detail. Do not ` +
    `invent post titles or facts not supported by the excerpts.`;

  if (relevantPosts.length > 0) {
    prompt += `\n\nRelevant blog excerpts:\n`;
    relevantPosts.forEach((p, i) => {
      prompt += `\n[${i + 1}] "${p.title}"\n${p.excerpt}\n`;
    });
  }

  return prompt;
}

// ---- Route ---------------------------------------------------------------

router.post("/", chatLimiter, async (req, res) => {
  try {
    const { message, history } = req.body || {};

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return res.status(400).json({ error: "Message is required." });
    }
    if (message.length > 2000) {
      return res
        .status(400)
        .json({ error: "Message is too long (max 2000 characters)." });
    }
    if (!process.env.GROQ_API_KEY) {
      console.error("chat.js: GROQ_API_KEY is not set.");
      return res.status(500).json({ error: "Chat is not configured yet." });
    }

    const relevantPosts = getRelevantPosts(message);
    const systemPrompt = buildSystemPrompt(relevantPosts);

    // Keep only the last few turns of history to control token usage
    // (Groq free tier is token-metered per minute too).
    const trimmedHistory = Array.isArray(history) ? history.slice(-6) : [];

    const messages = [
      { role: "system", content: systemPrompt },
      ...trimmedHistory.filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
      ),
      { role: "user", content: message },
    ];

    const groqResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.5,
        max_tokens: 400,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error("Groq API error:", groqResponse.status, errText);
      if (groqResponse.status === 429) {
        return res.status(429).json({
          error:
            "The AI chat is busy right now — please try again in a minute.",
        });
      }
      return res
        .status(502)
        .json({ error: "The AI chat is temporarily unavailable." });
    }

    const data = await groqResponse.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res
        .status(502)
        .json({ error: "No response from the AI service." });
    }

    return res.json({
      reply,
      sources: relevantPosts.map((p) => ({ title: p.title, slug: p.slug })),
    });
  } catch (err) {
    console.error("chat.js: unexpected error:", err);
    return res.status(500).json({ error: "Something went wrong." });
  }
});

export default router;
