# Wiring the AI chat into Essence

## 1. Get a free Groq API key
Go to https://console.groq.com/keys, sign up (email or Google, no credit card), create a key.
Free tier as of mid-2026: roughly 30 requests/min, 1,000 requests/day for `llama-3.3-70b-versatile`
(check the console for your current limits — Groq adjusts these over time).

## 2. Install the one new dependency (skip if already installed for your login rate limiting)
```
npm install express-rate-limit
```

## 3. Add the API key to your environment
In `.env` (make sure `.env` is in `.gitignore`, which it already is for your project):
```
GROQ_API_KEY=gsk_your_key_here
```
On Render: add `GROQ_API_KEY` under your service's **Environment** tab.

## 4. Copy files into your project
```
routes/chat.js                   -> your project's routes/ folder
public/js/chat-widget.js         -> your project's public/js/ folder
public/css/chat-widget.css       -> your project's public/css/ folder
```

## 5. Register the route in server.js
```js
const chatRouter = require('./routes/chat');
app.use('/api/chat', chatRouter);
```
Add this alongside your other route registrations, after `express.json()` middleware is set up
(chat.js expects `req.body` to already be parsed as JSON).

## 6. Include the widget on your pages
Add to the `<head>` of index.html / about.html / post pages:
```html
<link rel="stylesheet" href="/css/chat-widget.css">
```
Add near the end of `<body>`, after your other scripts:
```html
<script src="/js/chat-widget.js"></script>
```

## 7. Check the field names in routes/chat.js match your data
`chat.js` reads `data/posts.json` and looks for `title` + (`content` or `body` or `excerpt`
or `summary`) on each post object, and `slug` or `id`. Open `getPostText()` in `chat.js` and
adjust the field names if your posts.json uses different keys than these.

## 8. Test locally, then deploy
```
npm start
```
Open your site, click the chat bubble bottom-right, ask something like "what's your most
recent post about?" — it should retrieve relevant post excerpts and answer using them.
General questions (e.g. "what's a good way to structure a blog post?") will get a normal
assistant answer with no sources cited.

## Notes / things I'm not 100% certain about (confidence ~70-80%)
- **Your exact posts.json schema** — I don't have your actual file, so the retrieval code
  guesses at common field names. Test with a content-specific question first; if it never
  finds sources, check field names per step 7.
- **express-rate-limit already installed** — your memory notes mention a rate-limited login
  endpoint, which strongly suggests this package is already a dependency, but confirm before
  assuming `npm install` is a no-op.
- **Groq's exact current rate limits** — these numbers move; verify in your Groq console
  rather than trusting the figures above if this is going into production.
