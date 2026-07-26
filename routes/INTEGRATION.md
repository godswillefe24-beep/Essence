# Wiring the AI chat into Essence

Same instructions as `../INTEGRATION.md` — this file is kept for reference when copying `chat.js` into other projects.

Retrieval reads from the Turso `posts` table (title, excerpt, embedding) and full article text from `posts/*.html` via `getFullPostText()` in `routes/chat.js`.
