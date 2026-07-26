// migrate.js — one-time schema creation + data seed.
//
// Run once: node migrate.js
//
// Safe to re-run: posts/settings/site_stats use INSERT OR REPLACE (so
// re-running with corrected data updates cleanly); comments/users/
// subscribers use INSERT OR IGNORE (so re-running won't create duplicates).
//
// Set ADMIN_PASSWORD in your environment before running (Render generates
// this automatically if configured in render.yaml).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { db } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function applySchema() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await db.execute(stmt);
  }
  console.log(`Schema applied (${statements.length} statements).`);

  // Idempotent: add embedding column if this database predates semantic search.
  try {
    await db.execute("ALTER TABLE posts ADD COLUMN embedding TEXT");
    console.log("Added posts.embedding column.");
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) {
      throw err;
    }
  }
}

async function seedPosts() {
  const posts = [
    {
      id: "1",
      slug: "post1",
      title: "Welcome to my blog",
      category: "Technology",
      date: "2025-11-26",
      excerpt:
        "Discover insights, stories, and ideas on technology, design, and web development.",
    },
    {
      id: "2",
      slug: "post2",
      title: "Latest Technology News and Innovations",
      category: "Technology",
      date: "2026-03-01",
      excerpt:
        "Explore the latest breakthroughs in AI, quantum computing, renewable energy, and cybersecurity.",
    },
    {
      id: "3",
      slug: "post3",
      title: "Getting Started with Your Blog",
      category: "Thoughts",
      date: "2025-12-10",
      excerpt:
        "Essential steps to get your blog up and running and build a dedicated audience.",
    },
    {
      id: "4",
      slug: "post4",
      title: "Advanced Customization Techniques",
      category: "Tutorial",
      date: "2026-01-15",
      excerpt:
        "Master CSS Grid, custom properties, and JavaScript for professional web design.",
    },
    {
      id: "5",
      slug: "post5",
      title: "How Computers Are Made (And Why It\u2019s Just 0s and 1s)",
      category: "Technology",
      date: "2026-05-05",
      excerpt:
        "At some point, everyone looks at a computer and thinks there's no way it runs on just 0s and 1s. But yes, it does.",
    },
    {
      id: "6",
      slug: "post6",
      title: "The Biggest Tech Trends Defining 2026",
      category: "Technology",
      date: "2026-05-16",
      excerpt:
        "Technology in 2026 is moving faster than ever, reshaping how people work, communicate, shop, and live.",
    },
    {
      id: "7",
      slug: "post7",
      title: "Latest Technology Trends Shaping the Future in 2026",
      category: "Technology",
      date: "2026-05-16",
      excerpt:
        "In 2026, the most impactful technology trends are reshaping the global economy and redefining competitive advantage.",
    },
    {
      id: "8",
      slug: "post8",
      title: "The Art of Great Writing",
      category: "Writing",
      date: "2026-07-03",
      excerpt:
        "Discover the essential qualities of great writing and practical tips to improve clarity, creativity, and organization.",
    },
    {
      id: "9",
      slug: "post9",
      title: "Understanding Digital Marketing",
      category: "Marketing",
      date: "2026-07-03",
      excerpt:
        "A guide to SEO, social media, email, content, and PPC \u2014 the core channels businesses use to reach customers online.",
    },
    {
      id: "10",
      slug: "post10",
      title: "AI Tools and Productivity",
      category: "Technology",
      date: "2026-07-04",
      excerpt:
        "How artificial intelligence is helping people automate routine work and focus on higher-value creative and strategic tasks.",
    },
    {
      id: "11",
      slug: "post11",
      title:
        "Gaming and Entertainment: How Interactive Media is Shaping Modern Entertainment",
      category: "Entertainment",
      date: "2026-07-07",
      excerpt:
        "How interactive media, esports, and streaming have turned gaming into one of the world's largest entertainment industries.",
    },
    {
      id: "12",
      slug: "post12",
      title:
        "Education and Online Learning: How Digital Technology is Transforming Modern Education",
      category: "Education",
      date: "2026-07-07",
      excerpt:
        "How digital technology is making education more flexible, accessible, and personalized for learners everywhere.",
    },
    {
      id: "13",
      slug: "post13",
      title: "Make Money Online / Online Business",
      category: "Business",
      date: "2026-07-07",
      excerpt:
        "Freelancing, e-commerce, content creation, and affiliate marketing \u2014 practical ways people are building income online.",
    },
    {
      id: "14",
      slug: "post14",
      title: "How Creativity Intersects with Personal Growth",
      category: "Thoughts",
      date: "2026-07-07",
      excerpt:
        "Creativity as a mindset \u2014 how experimentation, self-awareness, and courage shape both creative work and personal growth.",
    },
    {
      id: "15",
      slug: "post15",
      title: "Finding Your Voice Through Self-Expression",
      category: "Thoughts",
      date: "2026-07-07",
      excerpt:
        "Why authenticity, not perfection, is what helps people connect \u2014 and how self-expression grows stronger with practice.",
    },
    {
      id: "16",
      slug: "post16",
      title:
        "Rare and Unusual Programming Languages You Probably Haven't Tried",
      category: "Technology",
      date: "2026-07-07",
      excerpt:
        "A tour of esoteric languages like Brainf*ck, Whitespace, Piet, and Chef, and what they teach about language design.",
    },
  ];

  for (const p of posts) {
    await db.execute({
      sql: `INSERT OR REPLACE INTO posts (id, slug, title, category, date, excerpt, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        p.id,
        p.slug,
        p.title,
        p.category,
        p.date,
        p.excerpt,
        new Date().toISOString(),
      ],
    });
  }
  console.log(`Seeded ${posts.length} posts.`);
}

async function seedComments() {
  const comments = [
    {
      id: "sample-comment-1",
      postId: "1",
      userId: null,
      name: "Reader",
      text: "Great introduction — looking forward to more posts!",
      timestamp: new Date().toISOString(),
    },
  ];

  for (const c of comments) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO comments (id, post_id, user_id, name, text, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [c.id, c.postId, c.userId, c.name, c.text, c.timestamp],
    });
  }
  console.log(`Seeded ${comments.length} sample comment(s).`);
}

async function seedSettings() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn(
      "ADMIN_PASSWORD not set — skipping admin password seed. " +
        "Set ADMIN_PASSWORD in your environment and re-run migrate, " +
        "or set a password via the admin settings panel after first login is configured.",
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.execute({
    sql: `INSERT OR REPLACE INTO settings (id, title, description, admin_password_hash)
          VALUES (1, ?, ?, ?)`,
    args: ["Essence", "A modern blog", passwordHash],
  });
  console.log("Settings seeded (admin password hashed from ADMIN_PASSWORD env var).");
}

async function seedSiteStats() {
  await db.execute({
    sql: `INSERT OR REPLACE INTO site_stats (id, total_likes) VALUES (1, ?)`,
    args: [0],
  });
  console.log("Site stats seeded (total_likes: 0).");
}

async function main() {
  console.log("Starting migration...\n");
  await applySchema();
  await seedPosts();
  await seedComments();
  await seedSettings();
  await seedSiteStats();
  console.log("\nMigration complete.");
  console.log("Next: node embed-posts.js (after setting HF_TOKEN for AI chat search).");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
