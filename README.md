# Essence Blog

A full-stack personal blog with 16 static post pages, Turso/libSQL persistence, user authentication, admin dashboard, newsletter subscriptions, and an AI chat widget with semantic search.

## Features

- Static HTML post pages with SEO metadata (Open Graph, JSON-LD, canonical URLs)
- Express REST API backed by [Turso](https://turso.tech) (libSQL)
- Comments, per-post likes, analytics, newsletter subscriptions
- User registration/login (JWT)
- Admin dashboard at `/admin.html`
- AI chat widget (Groq LLM + Hugging Face embeddings for semantic post search)
- Dark mode, PWA manifest, service worker, RSS feed

## Prerequisites

- Node.js 18+
- npm
- A free Turso database ([turso.tech](https://turso.tech))
- Optional: Groq API key (chat), Hugging Face token (semantic search), Gmail/SendGrid (email)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in your values:

```bash
copy .env.example .env
```

**Required:**

| Variable | Description |
|----------|-------------|
| `TURSO_DATABASE_URL` | Turso database URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `JWT_SECRET` | Random secret for JWT signing (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `ADMIN_PASSWORD` | Password for `/admin.html` login |

**Optional:**

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | AI chat ([console.groq.com](https://console.groq.com/keys)) |
| `HF_TOKEN` | Semantic search embeddings ([huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)) |
| `EMAIL_USER`, `EMAIL_PASSWORD` | Gmail app password for subscription emails |
| `SENDGRID_API_KEY`, `EMAIL_FROM` | SendGrid alternative for emails |
| `MAILCHIMP_API_KEY`, `MAILCHIMP_LIST_ID` | Mailchimp list sync |
| `CORS_ORIGINS` | Comma-separated browser origins allowed for cross-origin API access; leave empty for same-origin only |

### 3. Initialize the database

Run the idempotent migration after each schema release. It creates the durable `analytics_sessions` and `analytics_events` tables used by the admin analytics dashboard.

```bash
node migrate.js
```

Authentication sessions are issued as `HttpOnly` cookies. In production, set `NODE_ENV=production` and serve the site over HTTPS so the cookie also receives the `Secure` attribute.

This creates all tables, applies required schema upgrades, seeds the 16 post metadata records, and hashes `ADMIN_PASSWORD` into the settings table. If you are upgrading a database that already contains legacy posts, run `node backfill-post-content.js` once afterward so the admin editor can load their full bodies from the database.

### 4. Enable semantic chat search (optional)

```bash
node embed-posts.js
```

Re-run whenever you add or edit posts. Requires `HF_TOKEN`.

### 5. Start the server

```bash
npm start
```

Open `http://localhost:3001` (or your `PORT` value).

Development with auto-restart:

```bash
npm run dev
```

## Project Structure

```
Essence/
├── index.html              # Homepage
├── about.html
├── admin.html              # Admin dashboard
├── script.js               # Unified frontend (all pages)
├── enhancements.js         # Homepage extras (reading time, breadcrumbs)
├── styles.css
├── server.js               # Express API
├── db.js                   # Turso client
├── schema.sql              # Database schema
├── migrate.js              # One-time DB setup
├── embed-posts.js          # Compute post embeddings
├── embeddings.js           # Hugging Face helper
├── routes/chat.js          # AI chat endpoint
├── posts/post1.html … post17.html
├── public/js/              # chat-widget.js, post-actions.js
├── public/css/
├── render.yaml             # Render deployment config
└── .env.example
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness health check |
| GET | `/api/posts` | List all posts |
| GET | `/api/comments/:postId` | Comments for a post |
| POST | `/api/comments` | Post a comment |
| POST | `/api/subscribe` | Newsletter signup |
| GET | `/api/analytics` | Site analytics |
| POST | `/api/analytics/view/:postId` | Record page view |
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | User login |
| POST | `/api/chat` | AI chat (streaming SSE) |
| POST | `/api/admin/login` | Admin login |
| GET | `/rss.xml` | RSS feed |

Admin routes require `Authorization: Bearer <token>` from `/api/admin/login`.

## Deployment (Render)

1. Connect your Git repository to Render.
2. Set environment variables listed in `render.yaml` (Turso credentials, API keys).
3. After first deploy, run `node migrate.js` locally against your production Turso DB (or use Render shell).
4. Run `node embed-posts.js` for AI search.

`render.yaml` auto-generates `JWT_SECRET` and `ADMIN_PASSWORD`.

## AI Chat Setup

See `INTEGRATION.md` for Groq chat widget setup and `SETUP2.md` for semantic embeddings upgrade.

## Security Notes

- Never commit `.env` — it is gitignored.
- Admin post HTML is sanitized (script tags, iframes, and inline event handlers are stripped).
- Comments are escaped on the client; inputs are sanitized server-side.
- Set a strong `JWT_SECRET` and `ADMIN_PASSWORD`.

## License

MIT — Built by Efe
