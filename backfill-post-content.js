// backfill-post-content.js — one-time script: migrates the real article
// HTML already sitting in posts/*.html into the new posts.content column,
// for every post created before that column existed.
//
// Run once, AFTER running add-post-content-column.sql:
//   node backfill-post-content.js
//
// Safe to re-run: it only ever overwrites content with the current
// contents of posts/<slug>.html, and skips posts that already have a
// non-empty content value UNLESS --force is passed.
//
//   node backfill-post-content.js --force   (re-extract every post)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { all, run } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORCE = process.argv.includes("--force");

// Extraction strategy, tried in order — hand-built posts (post1-16) predate
// the admin-generated template, so their markup shape isn't guaranteed:
//   1. <section class="content">...</section>  (what the admin pipeline writes)
//   2. <article ...>...</article>               (common hand-authored shape)
//   3. <body>...</body>                          (last-resort fallback)
function extractContent(html) {
  const sectionMatch = html.match(
    /<section[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
  );
  if (sectionMatch) return { html: sectionMatch[1].trim(), strategy: "section.content" };

  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) return { html: articleMatch[1].trim(), strategy: "article" };

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return { html: bodyMatch[1].trim(), strategy: "body (unreliable — check manually)" };

  return null;
}

async function main() {
  const posts = await all(
    "SELECT id, slug, title, content FROM posts ORDER BY id",
  );
  console.log(`Found ${posts.length} posts.\n`);

  let migrated = 0;
  let skipped = 0;
  let missingFile = 0;

  for (const post of posts) {
    if (post.content && post.content.trim() && !FORCE) {
      console.log(`  SKIP (already has content): ${post.slug}`);
      skipped++;
      continue;
    }

    const filepath = path.join(__dirname, "posts", `${post.slug}.html`);
    if (!fs.existsSync(filepath)) {
      console.warn(`  (!) MISSING FILE, cannot backfill: ${post.slug}.html`);
      missingFile++;
      continue;
    }

    const html = fs.readFileSync(filepath, "utf8");
    const extracted = extractContent(html);

    if (!extracted) {
      console.warn(`  (!) Could not find any content region in ${post.slug}.html — skipped`);
      continue;
    }

    await run("UPDATE posts SET content = ? WHERE id = ?", [
      extracted.html,
      post.id,
    ]);

    const flag = extracted.strategy.startsWith("body") ? "  ⚠ REVIEW MANUALLY" : "";
    console.log(`  OK: ${post.slug} (via ${extracted.strategy})${flag}`);
    migrated++;
  }

  console.log(
    `\nDone. Migrated: ${migrated}, Skipped (already had content): ${skipped}, Missing file: ${missingFile}.`,
  );
  if (migrated > 0) {
    console.log(
      "Recommended: spot-check a few posts via GET /api/posts/:id before removing any static-file fallback.",
    );
  }
}

main().catch((err) => {
  console.error("Backfill script failed:", err);
  process.exit(1);
});
