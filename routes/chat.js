// routes/chat.js  (ES Module — matches "type": "module" in package.json)
//
// AI chatbot endpoint for Essence, powered by Groq's free API
// (open-source models: Llama 3.3, hosted for free at api.groq.com).
// Streams the reply to the client as it's generated.
//
// Retrieval: semantic search via Hugging Face embeddings (hosted, free
// tier) against post embeddings stored in the database, with automatic
// fallback to keyword matching if the embeddings call fails for any reason.
//
// Setup:
//   1. npm install express-rate-limit   (skip if already installed)
//   2. Get a free Groq key: https://console.groq.com/keys
//   3. Get a free HF token: https://huggingface.co/settings/tokens
//   4. Add to .env: GROQ_API_KEY=gsk_xxx   HF_TOKEN=hf_xxx
//   5. Run embed-posts.js once (and again whenever posts change)
//   6. In server.js:
//        import chatRouter from './routes/chat.js';
//        app.use('/api/chat', chatRouter);

import express from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { all } from "../db.js";
import { getEmbedding, cosineSimilarity } from "../embeddings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ---- Config -----------------------------------------------------------

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
// llama-3.3-70b-versatile was decommissioned by Groq on 2026-08-16 (see
// their "REMINDER: Llama 3.3 70B Versatile is being decommissioned" email)
// — requests to it now fail, which is why the chat widget started showing
// "The AI chat is temporarily unavailable". Groq's own notice named two
// replacements: "GPT OSS 120B" and "Qwen3.6 27B" (marketing names, not API
// identifiers — their email didn't include the literal model strings).
// Defaulting to openai/gpt-oss-120b, which matches Groq's known model-ID
// convention from before this model's release. Overridable via env var so
// a wrong guess (or Groq changing things again) doesn't need a redeploy —
// just set GROQ_MODEL in Render's environment tab.
// Verify the exact current string at https://console.groq.com/docs/models
// before relying on the default.
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// Excerpt length sent to the model per matched post. 2,500 chars ≈ 600-650
// tokens. At 3 posts max that's ~1,900 tokens of context — well inside
// Groq's free-tier ~12,000 tokens/min limit, and enough to catch facts
// beyond just a post's intro paragraph.
const EXCERPT_LENGTH = 2500;
const MAX_MATCHED_POSTS = 3;
// Minimum cosine similarity to count as "relevant" for a sentence-embedding
// model like MiniLM — genuinely related content typically scores well above
// this; unrelated content typically scores well below it.
const MIN_SIMILARITY = 0.25;
// A post needs at least this keyword score to count as relevant in the
// fallback path — a single incidental keyword match (score 1) doesn't
// qualify, which was causing wrong-post citations in earlier testing.
const MIN_KEYWORD_SCORE = 2;

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "You're sending messages a bit fast — please wait a moment.",
  },
});

// ---- Full post text, read directly from the static HTML files ----------
// (the DB only stores a short excerpt for listings — the real article text
// lives in posts/*.html, same as embed-posts.js reads for computing
// embeddings)

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFullPostText(slug) {
  try {
    const filepath = path.join(__dirname, "..", "posts", `${slug}.html`);
    if (!fs.existsSync(filepath)) return null;
    const html = fs.readFileSync(filepath, "utf-8");
    return htmlToText(html);
  } catch {
    return null;
  }
}

// ---- Retrieval: embeddings first, keyword matching as fallback ---------

export function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

export function scorePostKeyword(post, queryTerms) {
  const titleTokens = tokenize(post.title);
  const bodyTokens = tokenize(post.excerpt);
  let score = 0;
  for (const term of queryTerms) {
    score += titleTokens.filter((t) => t.includes(term)).length * 3;
    score += bodyTokens.filter((t) => t.includes(term)).length;
  }
  return score;
}

export function buildMatchedPost(post) {
  const fullText = getFullPostText(post.slug);
  return {
    title: post.title,
    slug: post.slug,
    excerpt: (fullText || post.excerpt || "").slice(0, EXCERPT_LENGTH),
  };
}

export function getRelevantPostsKeyword(query, posts) {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const scored = posts
    .map((post) => ({ post, score: scorePostKeyword(post, queryTerms) }))
    .filter((p) => p.score >= MIN_KEYWORD_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHED_POSTS);

  return scored.map(({ post }) => buildMatchedPost(post));
}

export async function getRelevantPostsEmbedding(
  query,
  posts,
  embedFn = getEmbedding,
) {
  const withEmbeddings = posts.filter((p) => p.embedding);
  if (withEmbeddings.length === 0) {
    throw new Error("No posts have embeddings yet — run embed-posts.js.");
  }

  const queryEmbedding = await embedFn(query);

  const scored = withEmbeddings
    .map((post) => {
      const postEmbedding = JSON.parse(post.embedding);
      return { post, score: cosineSimilarity(queryEmbedding, postEmbedding) };
    })
    .filter((p) => p.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHED_POSTS);

  return scored.map(({ post }) => buildMatchedPost(post));
}

async function getRelevantPosts(query) {
  let posts;
  try {
    // Limit to 50 most recent posts to avoid loading large embedding data
    // for all posts. Semantic search will rank by relevance anyway.
    posts = await all(
      `SELECT id, slug, title, excerpt, embedding FROM posts 
       ORDER BY date DESC LIMIT 50`,
    );
  } catch (err) {
    // Most likely cause: the embedding column doesn't exist yet (migration
    // not run). Don't let that crash the whole chat request — fall back to
    // a query that doesn't depend on it, and keyword search will still work.
    console.error(
      "chat.js: posts query with embedding column failed, retrying without it:",
      err.message,
    );
    try {
      const fallbackRows = await all(
        `SELECT id, slug, title, excerpt FROM posts 
         ORDER BY date DESC LIMIT 50`,
      );
      posts = fallbackRows.map((p) => ({ ...p, embedding: null }));
    } catch (err2) {
      console.error("chat.js: posts query failed entirely:", err2.message);
      return [];
    }
  }

  if (posts.length === 0) return [];

  try {
    return await getRelevantPostsEmbedding(query, posts);
  } catch (err) {
    console.error(
      "chat.js: embedding search failed, falling back to keyword search:",
      err.message,
    );
    return getRelevantPostsKeyword(query, posts);
  }
}

// ---- Prompt construction -----------------------------------------------

export function buildSystemPrompt(relevantPosts, pageContext) {
  let prompt =
    `You are a friendly, concise assistant embedded on a blog called Essence. ` +
    `Answer visitor questions helpfully. Keep answers under ~120 words unless asked for more detail.`;

  if (pageContext && pageContext.content) {
    prompt +=
      `\n\nThe visitor is currently reading this page:\n` +
      `Title: "${pageContext.title}"\n` +
      `URL: ${pageContext.url}\n` +
      `Content:\n${pageContext.content}\n\n` +
      `If the visitor asks you to summarize "this post", "this page", or asks a ` +
      `question that's naturally about what they're currently reading, answer using ` +
      `the content above — you do not need a database lookup for that, the content ` +
      `is right here. Do not say you can't see the page; you can.`;
  }

  if (relevantPosts.length > 0) {
    prompt += `\n\nRelevant blog excerpts from other posts (use if helpful for the visitor's question):\n`;
    relevantPosts.forEach((p, i) => {
      prompt += `\n[${i + 1}] "${p.title}"\n${p.excerpt}\n`;
    });
  }

  if (!pageContext?.content && relevantPosts.length === 0) {
    prompt +=
      `\n\nNo specific page or post content was provided for this message. ` +
      `If asked to summarize "this post" and you have no content to summarize, say so ` +
      `plainly and ask the visitor which post they mean, rather than guessing.`;
  }

  return prompt;
}

// ---- Response normalization ---------------------------------------------

export function extractAssistantText(payload) {
  const choice = payload?.choices?.[0];
  const content =
    choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
  return typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .map((part) =>
            typeof part === "string"
              ? part
              : typeof part?.text === "string"
                ? part.text
                : "",
          )
          .join("")
      : "";
}

// ---- Route ---------------------------------------------------------------

router.post("/", chatLimiter, async (req, res) => {
  try {
    const { message, history, pageContext } = req.body || {};

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

    // Defense in depth: the client already caps this, but don't trust it —
    // cap again server-side before it goes anywhere near the prompt/token budget.
    let safePageContext = null;
    if (pageContext && typeof pageContext === "object") {
      safePageContext = {
        url:
          typeof pageContext.url === "string"
            ? pageContext.url.slice(0, 300)
            : "",
        title:
          typeof pageContext.title === "string"
            ? pageContext.title.slice(0, 300)
            : "",
        content:
          typeof pageContext.content === "string"
            ? pageContext.content.slice(0, 4000)
            : "",
      };
    }

    const relevantPosts = await getRelevantPosts(message);
    const systemPrompt = buildSystemPrompt(relevantPosts, safePageContext);

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
        stream: true,
      }),
    });

    // Check for errors BEFORE switching into streaming mode, so we can
    // still send a normal JSON error response with the right status code.
    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error(
        "Groq API error:",
        groqResponse.status,
        `(model: ${GROQ_MODEL})`,
        errText,
      );
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

    // Some compatible OpenAI-style gateways return one JSON completion even
    // when stream=true is requested. Normalize that response into the same SSE
    // contract instead of ending with sources and no assistant text.
    const responseType = groqResponse.headers.get("content-type") || "";
    if (responseType.includes("application/json")) {
      const body = await groqResponse.json();
      const text = extractAssistantText(body);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if (typeof res.flushHeaders === "function") res.flushHeaders();
      res.write(
        `data: ${JSON.stringify({
          type: "sources",
          sources: relevantPosts.map((p) => ({ title: p.title, slug: p.slug })),
        })}\n\n`,
      );
      if (text) {
        res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      return res.end();
    }

    // --- From here on we're committed to a streaming response ---
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    // Send the sources first so the widget can show them once streaming finishes.
    res.write(
      `data: ${JSON.stringify({
        type: "sources",
        sources: relevantPosts.map((p) => ({ title: p.title, slug: p.slug })),
      })}\n\n`,
    );

    const reader = groqResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sentAnyDelta = false;

    const forwardPayload = (payload) => {
      if (payload === "[DONE]") {
        if (!sentAnyDelta) {
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              message: "The AI returned an empty response. Please try again.",
            })}\n\n`,
          );
        }
        return true;
      }
      try {
        const parsed = JSON.parse(payload);
        const deltaText = extractAssistantText(parsed);
        if (deltaText) {
          sentAnyDelta = true;
          res.write(
            `data: ${JSON.stringify({ type: "delta", text: deltaText })}\n\n`,
          );
        }
      } catch {
        // Partial/incomplete JSON chunk — safe to ignore, next read() will complete it.
      }
      return false;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep any incomplete line for next chunk

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (forwardPayload(payload)) {
          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
          res.end();
          return;
        }
      }
    }

    // Some providers close the stream without a final newline. Process the
    // buffered data before ending, otherwise the last assistant token is lost.
    const trailingLine = buffer.trim();
    if (trailingLine.startsWith("data:")) {
      const trailingPayload = trailingLine.slice(5).trim();
      if (forwardPayload(trailingPayload)) {
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
        return;
      }
    }

    if (!sentAnyDelta) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "The AI returned an empty response. Please try again.",
        })}\n\n`,
      );
    }

    // Stream ended without an explicit [DONE] marker (uncommon, but be safe).
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err) {
    console.error("chat.js: unexpected error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Something went wrong." });
    } else {
      try {
        res.write(
          `data: ${JSON.stringify({ type: "error", message: "Something went wrong." })}\n\n`,
        );
      } catch {
        // response may already be closed
      }
      res.end();
    }
  }
});

export default router;
