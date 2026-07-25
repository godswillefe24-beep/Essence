# Migrating Essence to Turso

## 1. Create a free Turso database
1. Go to https://turso.tech, sign up (no credit card required)
2. Create a database (via the web dashboard, or the CLI: `turso db create essence`)
3. Get your database URL and auth token:
   - Dashboard: click your database → copy the URL (`libsql://...`) and generate a token
   - CLI: `turso db show essence --url` and `turso db tokens create essence`

## 2. Install the new dependency
```
npm install @libsql/client
```

## 3. Set environment variables
Add to `.env` locally, and to Render's **Environment** tab for production:
```
TURSO_DATABASE_URL=libsql://your-db-name-your-org.turso.io
TURSO_AUTH_TOKEN=your-token-here
JWT_SECRET=<generate one — see below>
```

`JWT_SECRET` is now **required** (the server throws a startup error if it's missing) —
previously it silently generated a random one on every boot, which meant every Render
restart invalidated all logged-in sessions and admin tokens without you knowing why.
Generate one once and keep it stable:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Copy the files into your project
```
db.js         -> project root
schema.sql    -> project root
migrate.js    -> project root (temporary — see step 6)
server.js     -> overwrite your existing server.js
```

## 5. Run the migration once
```
node migrate.js
```
This creates all tables and seeds them with your **real** current data — the actual
16 posts as they exist live on your site (not the old, partially-stale `data/posts.json`),
your real comments, your real user account, your real subscriber, and your settings —
with the admin password properly bcrypt-hashed instead of stored in plaintext.

You should see output ending in `Migration complete.` If anything fails, nothing was
partially written that matters — `INSERT OR REPLACE` / `INSERT OR IGNORE` make it safe
to fix the issue and re-run.

## 6. Clean up the plaintext password
`migrate.js` contains your real admin password in plaintext (`ADMIN_PASSWORD_PLAINTEXT`)
so it can be hashed on the way in. **Before committing anything to git:**
- Delete `migrate.js`, or
- At minimum, blank out the `ADMIN_PASSWORD_PLAINTEXT` value

Keep a local copy of `migrate.js` somewhere outside your repo if you might need to
re-run it later (e.g. setting up a second environment).

## 7. Test before deploying
- [ ] `npm start` runs without the JWT_SECRET/Turso env errors
- [ ] `GET /api/posts` returns all 16 posts
- [ ] Log into `/admin.html` with your existing password
- [ ] Existing comments still show on post1
- [ ] Post a new test comment, confirm it appears
- [ ] Check `/api/admin/subscribers` shows your existing subscriber
- [ ] Ask the AI chat widget to summarize a post (confirms nothing broke upstream)

## 8. Deploy
Commit `db.js`, `schema.sql`, and the new `server.js`. Do **not** commit `migrate.js`
with the real password still in it (see step 6). Set the three environment variables
on Render, then deploy.

Once confirmed working in production, you can remove `data/*.json` from your repo —
they're no longer read by the server. Keep a backup copy somewhere safe first, just
in case.

## Known risk, unchanged from before this migration
The admin dashboard's "create/edit post" feature writes a **generic auto-generated
HTML template** to `posts/<id>.html`. If you ever use it with an id matching one of
your real posts (`post1` through `post16`), it will overwrite that real, hand-built
page with the generic template. This risk already existed before the migration (the
old `data/posts.json` had the same id scheme) — it's not something the migration
introduced, just something easy to forget now that the underlying storage looks more
"real." Safest practice: only use the admin create/edit feature for genuinely new
post ids, not to edit post1–16.

## What did NOT change
- `/rss.xml` — still reads `posts/*.html` directly, not database-backed
- `/api/admin/stats` and `/api/admin/analytics` — still in-memory only (was already
  ephemeral before the migration, and includes `Math.random()` demo data for the
  view-trend chart — not real persisted data either way)
- Admin post create/edit/delete still writes real `.html` files to `posts/`, unchanged
  mechanism — only the *metadata* storage (title/category/date/excerpt) moved to the DB
