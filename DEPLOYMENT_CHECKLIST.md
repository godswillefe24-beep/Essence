# Essence — Full Deployment Verification Checklist

## Before deploying
- [ ] `node --import ./tests/setup.js --test` passes locally (98 tests)
- [ ] `.env` has: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, JWT_SECRET, ADMIN_PASSWORD,
      GROQ_API_KEY, HF_TOKEN
- [ ] Render environment variables match `.env` (Environment tab)
- [ ] `node migrate.js` has been run at least once against production Turso DB
- [ ] `node embed-posts.js` has been run at least once (chat semantic search)

## Homepage (index.html)
- [ ] All 16 post cards visible
- [ ] Click each filter button (Technology, Thoughts, Tutorial, Writing, Marketing,
      Entertainment, Education, Business) — correct posts show/hide, not empty
- [ ] Recent Posts sidebar shows 3 posts, correctly sorted by date
- [ ] Popular Posts sidebar — shows real posts once some have views, or a graceful
      "No view data yet" message if none do
- [ ] Subscribe: enter a valid email, click Subscribe — success toast appears,
      field clears. Try an invalid email — error toast, no crash
- [ ] Dark mode toggle works and persists on reload
- [ ] AI chat bubble appears bottom-right, doesn't overlap the back-to-top button

## Individual post pages (spot-check 2-3, not all 16)
- [ ] Images load (post1's hero image, post2's 6 content images)
- [ ] Comments section loads, can post a new comment
- [ ] Like button: click once → count increases, button visually shows "liked".
      Click again → count decreases, unliked. Refresh page → liked state persists
      (localStorage)
- [ ] Share buttons open the correct platform share dialog; copy-link button
      shows "Copied!" feedback
- [ ] Related Posts section appears with 2-3 same-category posts (or doesn't
      appear at all if genuinely none — both are correct depending on category)
- [ ] Back-to-top button appears after scrolling, scrolls to top on click
- [ ] AI chat: ask "summarize this post" — should reference actual page content,
      not say it can't see the page

## AI Chat (semantic search)
- [ ] Ask a question that shares NO keywords with a post's title but is clearly
      about its topic (e.g. "how do you stop people faking logins" instead of
      "JWT authentication") — correct post should still surface if semantic
      search is working
- [ ] Check server logs for "embedding search failed, falling back to keyword
      search" — if this appears constantly, embeddings may not be set up
      correctly even though chat doesn't crash

## Admin dashboard (/admin.html)
- [ ] Login with your real admin password works
- [ ] Overview tab: Posts count shows 16 (not hardcoded 4), Likes/Comments/
      Subscribers show real numbers
- [ ] Top Posts by Views and Top Posts by Likes sections show real data (or
      "No data yet" if nothing has views/likes yet)
- [ ] Posts, Comments, Subscribers tabs load real data
- [ ] Settings tab: change and save blog title/description

## RSS feed
- [ ] `/rss.xml` loads and includes all 16 posts with correct titles/dates

## Known non-goals (not bugs if these don't do anything)
- Admin dashboard's "New Post" button generates a plain auto-templated HTML
  file — do not use it to edit post1-16.html, it will overwrite the real
  hand-built page with a generic template
- `pageViewTrend` on the admin stats endpoint is a single real cumulative
  number, not a day-by-day chart — no daily-granularity view data is stored
