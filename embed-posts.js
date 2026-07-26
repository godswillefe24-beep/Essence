// embed-posts.js — one-time script: computes an embedding for each post's
// real article text (pulled from posts/*.html, not just the short DB
// excerpt) and stores it in the posts.embedding column.
//
// Run once: node embed-posts.js
// Re-run any time you add or edit a post — it's safe to run repeatedly,
// it just overwrites each post's stored embedding.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db, all, run } from "./db.js";
import { getEmbedding } from "./embeddings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Very small, dependency-free HTML-to-text extractor. Good enough for this
// one-time offline task — not trying to replace a real HTML parser.
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

async function main() {
  const posts = await all("SELECT id, slug, title, excerpt FROM posts");
  console.log(`Found ${posts.length} posts to embed.\n`);

  for (const post of posts) {
    const filepath = path.join(__dirname, "posts", `${post.slug}.html`);
    let text;

    if (fs.existsSync(filepath)) {
      const html = fs.readFileSync(filepath, "utf8");
      text = `${post.title}\n\n${htmlToText(html)}`.slice(0, 6000);
    } else {
      // Fall back to title + excerpt if the static file isn't found for
      // some reason — still better than skipping the post entirely.
      console.warn(
        `  (!) ${post.slug}.html not found, embedding title+excerpt only`,
      );
      text = `${post.title}\n\n${post.excerpt || ""}`;
    }

    try {
      const embedding = await getEmbedding(text);
      await run("UPDATE posts SET embedding = ? WHERE id = ?", [
        JSON.stringify(embedding),
        post.id,
      ]);
      console.log(`  OK: ${post.slug} (${embedding.length}-dim vector)`);
    } catch (err) {
      console.error(`  FAILED: ${post.slug} — ${err.message}`);
    }

    // Be polite to the free-tier rate limit — small delay between calls.
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\nDone. Re-run this script any time you add or edit a post.");
}

main().catch((err) => {
  console.error("Embedding script failed:", err);
  process.exit(1);
});
