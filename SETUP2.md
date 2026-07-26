# Upgrading chat search to real semantic embeddings

Builds on the Turso database migration — do that first if you haven't.

## 1. Get a free Hugging Face token
https://huggingface.co/settings/tokens — no credit card required. Create a token
with "read" access.

## 2. Install the client library
```
npm install @huggingface/inference
```
(An earlier version of this used a raw fetch() call to a Hugging Face endpoint
that turned out to be deprecated — every request failed with a generic "fetch
failed" error. This version uses their official client library instead, which
handles their inference routing correctly regardless of future changes on
their end.)

## 3. Add to your environment (.env and Render)
```
HF_TOKEN=hf_xxxxxxxxxxxx
```

## 4. Add the embedding column to your database
Run `add-embedding-column.sql` once against your Turso database. If you already have
`run-sql-file.js` from the earlier post-likes setup, reuse it:
```
node run-sql-file.js add-embedding-column.sql
```
(If you're on Mac/Linux and have the Turso CLI installed, `turso db shell essence <
add-embedding-column.sql` also works — but the CLI requires WSL on Windows, so
`run-sql-file.js` is the simpler path either way.)

## 5. Copy the files into your project
```
embeddings.js       -> project root
embed-posts.js       -> project root
chat.js               -> routes/chat.js (overwrite)
```

## 6. Compute embeddings for your 16 posts
```
node embed-posts.js
```
This reads the real article text from each `posts/postN.html` file (not just the
short excerpt stored in the DB), embeds it via Hugging Face's free API, and stores
the resulting vector in the database. Takes about 15-20 seconds for 16 posts, mostly
rate-limit-friendly delay between calls, not actual processing time.

**Re-run this any time you add or edit a post** — it's safe to run repeatedly.

## 7. Test
Ask the chat widget something that shares almost no keywords with a post's title but
is clearly about its topic — e.g. "how do I stop people from faking logins" should
now surface your JWT/rate-limiting content even without the words "JWT" or "rate
limit" appearing in the question. That's the actual improvement over keyword
matching: catching the *meaning* of a question, not just shared words.

## How the fallback works
If the Hugging Face API is ever slow, rate-limited, or unreachable, `chat.js`
automatically falls back to the original keyword-matching search instead of failing
the whole request. You'll see a console log (`embedding search failed, falling back
to keyword search`) when this happens — the chat still works, just with the older,
less precise matching for that one request.

## What this does NOT change
- The Groq LLM call itself — unchanged
- Page-context awareness (summarizing the current post) — unchanged, still works
  independently of this upgrade
- Excerpt length sent to the model (2,500 chars) — unchanged, still well within
  Groq's free-tier token budget
