# Wiring the AI chat into Essence

## 1. Get a free Groq API key
Go to https://console.groq.com/keys, sign up (email or Google, no credit card), create a key.

## 2. Get a free Hugging Face token (semantic search)
Go to https://huggingface.co/settings/tokens — create a token with "read" access. See `SETUP2.md` for embedding setup.

## 3. Add keys to your environment
In `.env` (see `.env.example`):

```
GROQ_API_KEY=gsk_your_key_here
HF_TOKEN=hf_your_token_here
```

On Render: add both under your service's **Environment** tab.

## 4. Files (already in this project)

```
routes/chat.js
public/js/chat-widget.js
public/css/chat-widget.css
embeddings.js
embed-posts.js
```

## 5. Route registration (already in server.js)

```js
import chatRouter from "./routes/chat.js";
app.use("/api/chat", chatRouter);
```

## 6. Include the widget on your pages

In `<head>`:

```html
<link rel="stylesheet" href="/public/css/chat-widget.css">
```

Near the end of `<body>`:

```html
<script src="/public/js/chat-widget.js"></script>
```

(Post pages use `../public/...` paths.)

## 7. Initialize embeddings

Post retrieval reads from the Turso `posts` table (with optional `embedding` column) and full article text from `posts/*.html`:

```bash
node migrate.js        # once
node embed-posts.js    # once, and again after post edits
```

## 8. Test

```bash
npm start
```

Open your site, click the chat bubble, ask a content-specific question. The widget sends current page text as `pageContext` so "summarize this post" works on post pages.

## Notes

- Chat falls back to keyword search if Hugging Face embeddings are unavailable.
- Rate limit: 8 messages/minute per IP (`express-rate-limit` in `routes/chat.js`).
- Groq model: `llama-3.3-70b-versatile` (check Groq console for current limits).
