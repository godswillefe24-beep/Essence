// tests/setup.js — preloaded before test files run (via --import), so
// db.js doesn't throw its "TURSO_DATABASE_URL must be set" error at import
// time. No test in this suite actually queries the database — this only
// satisfies db.js's startup guard. @libsql/client's createClient() doesn't
// connect until a query actually runs, so a dummy value is enough.
process.env.TURSO_DATABASE_URL ||= "libsql://dummy-for-tests.turso.io";
process.env.TURSO_AUTH_TOKEN ||= "dummy-token-for-tests";
