// db.js — Turso/libSQL client wrapper.
//
// Setup:
//   npm install @libsql/client
//   Create a free database at https://turso.tech (no credit card required)
//   Add to your .env (and to Render's Environment tab for production):
//     TURSO_DATABASE_URL=libsql://your-db-name.turso.io
//     TURSO_AUTH_TOKEN=your-token

import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Loads .env manually (this project doesn't use the `dotenv` package).
// Runs here — not just in server.js — so standalone scripts that import
// this file (migrate.js, embed-posts.js) also get .env loaded, even when
// run directly with `node migrate.js` instead of through the server.
function loadEnvFile() {
  const envFile = path.join(__dirname, ".env");
  if (!fs.existsSync(envFile)) return;

  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;

    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim();
    if (!process.env[key]) {
      process.env[key] = value.replace(/^['"]|['"]$/g, "");
    }
  });
}

loadEnvFile();

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  throw new Error(
    "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set. " +
      "Create a free database at https://turso.tech and add both to your environment.",
  );
}

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

/**
 * Run a query and return all rows as plain objects.
 * @param {string} sql
 * @param {Array|Object} args
 */
export async function all(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows.map((row) => ({ ...row }));
}

/**
 * Run a query and return the first row (or null).
 */
export async function get(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0] || null;
}

/**
 * Run an INSERT/UPDATE/DELETE. Returns { rowsAffected, lastInsertRowid }.
 */
export async function run(sql, args = []) {
  const result = await db.execute({ sql, args });
  return {
    rowsAffected: result.rowsAffected,
    lastInsertRowid: result.lastInsertRowid,
  };
}

/**
 * Run several statements as a single atomic transaction.
 * statements: [{ sql, args }, ...]
 */
export async function transaction(statements) {
  return db.batch(
    statements.map((s) => ({ sql: s.sql, args: s.args || [] })),
    "write",
  );
}
