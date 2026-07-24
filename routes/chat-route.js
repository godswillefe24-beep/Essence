// routes/chat.js  (ES Module — matches "type": "module" in package.json)
//
// AI chatbot endpoint for Essence, powered by Groq's free API
// (open-source models: Llama 3.3, hosted for free at api.groq.com).
// Streams the reply to the client as it's generated.
//
// Setup:
//   1. npm install express-rate-limit   (skip if already installed)
//   2. Get a free API key: https://console.groq.com/keys (no credit card)
//   3. Add to your .env:  GROQ_API_KEY=gsk_xxxxxxxxxxxx
//   4. In server.js:
//        import chatRouter from './routes/chat.js';
//        app.use('/api/chat', chatRouter);

import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ---- Config -----------------------------------------------------------

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const POSTS_PATH = path.join(__dirname, '..', 'data', 'posts.json');

// Excerpt length sent to the model per matched post. 2,500 chars ≈ 600-650
// tokens. At 3 posts max that's ~1,900 tokens of context — well inside
// Groq's free-tier ~12,000 tokens/min limit, and enough to catch facts
// beyond just a post's intro paragraph.
const EXCERPT_LENGTH = 2500;
const MAX_MATCHED_POSTS = 3;
// A post needs at least this score to be considered "relevant" — a single
// incidental keyword match (score 1) no longer qualifies, which was
// causing wrong-post citations.
const MIN_RELEVANCE_SCORE = 2;

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're sending messages a bit fast — please wait a moment." },
});

// ---- Lightweight retrieval (no vector DB needed for a JSON-file blog) --

function loadPosts() {
  try {
    const raw = fs.readFileSync(POSTS_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : (data.posts || []);
  } catch (err) {
    console.error('chat.js: could not load posts.json for retrieval:', err.message);
    return [];
  }
}

function getPostText(post) {
  const title = post.title || '';
  const body = post.content || post.body || post.excerpt || post.summary || '';
  return { title, body };
}

function tokenize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

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

function getRelevantPosts(query, limit = MAX_MATCHED_POSTS) {
  const posts = loadPosts();
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || posts.length === 0) return [];

  const scored = posts
    .map((post) => ({ post, score: scorePost(post, queryTerms) }))
    .filter((p) => p.score >= MIN_RELEVANCE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ post }) => {
    const { title, body } = getPostText(post);
    return {
      title,
      slug: post.slug || post.id || '',
      excerpt: body.slice(0, EXCERPT_LENGTH),
    };
  });
}

// ---- Prompt construction -----------------------------------------------

function buildSystemPrompt(relevantPosts, pageContext) {
  let prompt = `You are a friendly, concise assistant embedded on a blog called Essence. ` +
    `Answer visitor questions helpfully. Keep answers under ~120 words unless asked for more detail.`;

  if (pageContext && pageContext.content) {
    prompt += `\n\nThe visitor is currently reading this page:\n` +
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
    prompt += `\n\nNo specific page or post content was provided for this message. ` +
      `If asked to summarize "this post" and you have no content to summarize, say so ` +
      `plainly and ask the visitor which post they mean, rather than guessing.`;
  }

  return prompt;
}

// ---- Route ---------------------------------------------------------------

router.post('/', chatLimiter, async (req, res) => {
  try {
    const { message, history, pageContext } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required.' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message is too long (max 2000 characters).' });
    }
    if (!process.env.GROQ_API_KEY) {
      console.error('chat.js: GROQ_API_KEY is not set.');
      return res.status(500).json({ error: 'Chat is not configured yet.' });
    }

    // Defense in depth: the client already caps this, but don't trust it —
    // cap again server-side before it goes anywhere near the prompt/token budget.
    let safePageContext = null;
    if (pageContext && typeof pageContext === 'object') {
      safePageContext = {
        url: typeof pageContext.url === 'string' ? pageContext.url.slice(0, 300) : '',
        title: typeof pageContext.title === 'string' ? pageContext.title.slice(0, 300) : '',
        content: typeof pageContext.content === 'string' ? pageContext.content.slice(0, 4000) : '',
      };
    }

    const relevantPosts = getRelevantPosts(message);
    const systemPrompt = buildSystemPrompt(relevantPosts, safePageContext);

    const trimmedHistory = Array.isArray(history) ? history.slice(-6) : [];

    const messages = [
      { role: 'system', content: systemPrompt },
      ...trimmedHistory.filter(
        (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
      ),
      { role: 'user', content: message },
    ];

    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
      console.error('Groq API error:', groqResponse.status, errText);
      if (groqResponse.status === 429) {
        return res.status(429).json({ error: 'The AI chat is busy right now — please try again in a minute.' });
      }
      return res.status(502).json({ error: 'The AI chat is temporarily unavailable.' });
    }

    // --- From here on we're committed to a streaming response ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    // Send the sources first so the widget can show them once streaming finishes.
    res.write(
      `data: ${JSON.stringify({
        type: 'sources',
        sources: relevantPosts.map((p) => ({ title: p.title, slug: p.slug })),
      })}\n\n`
    );

    const reader = groqResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep any incomplete line for next chunk

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();

        if (payload === '[DONE]') {
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          res.end();
          return;
        }

        try {
          const parsed = JSON.parse(payload);
          const deltaText = parsed?.choices?.[0]?.delta?.content;
          if (deltaText) {
            res.write(`data: ${JSON.stringify({ type: 'delta', text: deltaText })}\n\n`);
          }
        } catch {
          // Partial/incomplete JSON chunk — safe to ignore, next read() will complete it.
        }
      }
    }

    // Stream ended without an explicit [DONE] marker (uncommon, but be safe).
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('chat.js: unexpected error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong.' });
    } else {
      // We already switched to SSE mode — send an error event instead of a status code.
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong.' })}\n\n`);
      } catch {
        // response may already be closed
      }
      res.end();
    }
  }
});

export default router;
