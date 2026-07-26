// run-sql-file.js — runs a .sql file against your Turso database using the
// same connection as migrate.js and server.js. No Turso CLI needed (which
// requires WSL on Windows).
//
// Usage:
//   node run-sql-file.js add-post-likes-table.sql

import fs from "fs";
import { db } from "./db.js";

const filename = process.argv[2];

if (!filename) {
  console.error("Usage: node run-sql-file.js <path-to-sql-file>");
  process.exit(1);
}

if (!fs.existsSync(filename)) {
  console.error(`File not found: ${filename}`);
  process.exit(1);
}

async function main() {
  const sql = fs.readFileSync(filename, "utf8");

  // Split into individual statements on semicolons, skipping comment-only
  // lines and blank statements.
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  console.log(
    `Running ${statements.length} statement(s) from ${filename}...\n`,
  );

  for (const stmt of statements) {
    // Strip leading comment lines within a statement block, if any.
    const cleaned = stmt
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim();

    if (!cleaned) continue;

    console.log(`> ${cleaned.slice(0, 80)}${cleaned.length > 80 ? "..." : ""}`);
    await db.execute(cleaned);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
