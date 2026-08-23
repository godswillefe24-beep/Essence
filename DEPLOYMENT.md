# Essence Production Deployment Guide

This guide covers the release that includes the database-backed analytics store, secure user and admin cookies, performance improvements, migration updates, security headers, request limits, CORS controls, and the deployment health endpoint.

> **Release rule:** back up the production database before applying migrations, and validate the release in a staging environment before exposing it publicly.

## 1. Release prerequisites

| Requirement | Production expectation |
|---|---|
| Node.js | Node.js 18 or newer; Node.js 20 or newer is preferred for long-lived deployments. |
| Database | A reachable Turso/libSQL database with credentials available only through the deployment secret manager. |
| HTTPS | Required. Secure cookies are enabled automatically when `NODE_ENV=production` or the request is recognized as HTTPS. |
| Process manager | A managed service such as Render, systemd, Docker, or another supervisor that restarts the process after failure. |
| Reverse proxy | Terminate TLS at the platform or reverse proxy and forward requests to the Node process. |
| Backups | A tested database backup and restore procedure before every schema release. |

## 2. Production environment variables

Create the production environment through the hosting provider's secret manager. Do not commit a populated `.env` file, credentials, JWT secrets, database tokens, or mail credentials.

| Variable | Required | Configuration guidance |
|---|---:|---|
| `NODE_ENV` | Yes | Set to `production`. This enables production cookie behavior and should never be omitted on the public deployment. |
| `TURSO_DATABASE_URL` | Yes | The production `libsql://...` URL. Do not use the local smoke-test or dummy URL. |
| `TURSO_AUTH_TOKEN` | Yes | A least-privilege database token stored as a deployment secret. Rotate it if it is ever exposed. |
| `JWT_SECRET` | Yes | A randomly generated secret of at least 32 bytes. Keep it stable during a deployment so active sessions are not unexpectedly invalidated; rotate deliberately when required. |
| `ADMIN_PASSWORD` | Yes for first migration | A strong, unique admin password. The migration hashes it into the settings table; do not use a placeholder. Change it through the admin settings workflow after first login if supported by the release. |
| `HOST` | Yes | Use `0.0.0.0` in container or platform deployments so the process accepts traffic from the platform proxy. |
| `PORT` | Yes | Use the platform-provided port when the hosting provider supplies one; otherwise use the service's configured internal port. |
| `CORS_ORIGINS` | Usually no | Comma-separated exact origins allowed for cross-origin API calls. Leave empty for the preferred same-origin deployment. Never use `*` for authenticated cross-origin traffic. |
| `GROQ_API_KEY` | Optional | Required only if the chat integration is enabled. Store it as a secret and apply provider-side quotas. |
| `HF_TOKEN` | Optional | Required for embedding generation/search. Do not run embedding generation during the web process boot. |
| `EMAIL_USER`, `EMAIL_PASSWORD` | Optional | Required only for the configured Gmail mail path; use an app password, not a personal account password. |
| `SENDGRID_API_KEY`, `EMAIL_FROM` | Optional | Alternative email provider configuration. Keep provider credentials server-side. |
| `MAILCHIMP_API_KEY`, `MAILCHIMP_LIST_ID` | Optional | Required only if subscriber synchronization is enabled. |

A minimum production configuration is:

```dotenv
NODE_ENV=production
TURSO_DATABASE_URL=libsql://your-production-db.turso.io
TURSO_AUTH_TOKEN=<secret-manager-value>
JWT_SECRET=<random-32-byte-or-longer-value>
ADMIN_PASSWORD=<unique-strong-password>
HOST=0.0.0.0
PORT=<platform-port>
CORS_ORIGINS=
```

## 3. Build and deploy sequence

### 3.1 Prepare the release

1. Review the commit and confirm that the working tree contains only intended release changes.
2. Ensure the dependency lockfile is committed. Prefer `npm ci --omit=dev` in production when a lockfile is available.
3. Confirm that `.env`, database files, logs, uploads, and generated secrets are excluded from version control.
4. Run the test and syntax checks in CI before deployment.

```bash
npm ci --omit=dev
npm test
node --check server.js
node --check script.js
node --check admin-script.js
node --check enhancements.js
node --check service-worker.js
```

### 3.2 Back up the database

Create a backup using the database provider's supported export or snapshot procedure. Record the backup identifier and verify that it can be downloaded or restored in a non-production database. Do not proceed when the backup cannot be located or restored.

### 3.3 Apply the migration

Run the migration exactly once against the intended production database from a controlled release environment:

```bash
node migrate.js
```

The migration creates the analytics tables and indexes, applies the legacy schema upgrades, seeds required settings, and preserves the existing data model. If the database contains legacy posts whose full bodies have not been copied into `posts.content`, run the one-time backfill afterward:

```bash
node backfill-post-content.js
```

Do not point the migration command at a dummy URL or at a developer database by accident. Print and verify the target database identifier before running it.

### 3.4 Start the application

```bash
npm start
```

Use the hosting platform's process supervisor to keep the service running. Configure graceful restart behavior, log collection, and automatic restart on non-zero exit. The application should listen on the internal `HOST` and `PORT` values; TLS should be handled by the platform or reverse proxy.

## 4. Post-deployment smoke checks

Set `BASE_URL` to the public HTTPS origin and verify the following:

```bash
curl -i "$BASE_URL/health"
curl -i "$BASE_URL/server.js"
curl -i -X OPTIONS "$BASE_URL/api/health" \
  -H 'Origin: https://unexpected.example' \
  -H 'Access-Control-Request-Method: POST'
```

Expected outcomes:

| Check | Expected result |
|---|---|
| `GET /health` | HTTP 200, JSON status `ok`, and `Cache-Control: no-store`. |
| `GET /server.js` | HTTP 404; backend source must not be served as a static file. |
| Security headers | `X-Content-Type-Options: nosniff`, frame protection, referrer policy, and production HSTS when HTTPS is active. |
| Unexpected CORS origin | No `Access-Control-Allow-Origin` response for an origin outside `CORS_ORIGINS`. |
| Admin login | HTTP 200 with no JWT in the JSON body and a `HttpOnly; Secure; SameSite=Strict` admin cookie. |
| User registration/login | HTTP success with no JWT in the JSON body and a separate user cookie. |
| Analytics ingestion | Valid batches return accepted page-view/event counts and survive a process restart. |
| Admin analytics | Authenticated reports show durable page views, events, top pages, daily trends, and active sessions. |
| Logout | The corresponding user or admin cookie is cleared without clearing the other session type. |
| Static pages | Homepage, post pages, admin page, images, CSS, and JavaScript load over HTTPS. |

## 5. Security checklist

Before opening the release to users, confirm that:

- `NODE_ENV=production` is set and the public URL is HTTPS.
- `JWT_SECRET`, database tokens, admin password, AI keys, and mail credentials are stored in the host secret manager.
- `CORS_ORIGINS` contains only exact, trusted origins, or is empty for same-origin hosting.
- The admin and user sessions use separate `HttpOnly` cookies and no login response exposes a JWT.
- The reverse proxy forwards HTTPS information correctly so the server can apply secure-cookie behavior.
- The database is not publicly writable except through the application credentials.
- The `/health` endpoint is used for liveness, while error logs and uptime monitoring cover failures.
- Database-backed analytics retention and privacy requirements have been reviewed; raw IP addresses are not stored by the new analytics schema.
- The newsletter export is protected by admin authentication and spreadsheet formula-injection protection.
- Upload limits, request limits, rate limits, and static-file restrictions remain active after the deployment.
- Backups and rollback credentials are available to the on-call maintainer.

## 6. Rollback procedure

If the service fails health checks or introduces data integrity issues:

1. Stop public traffic or revert the application image/commit to the last known-good release.
2. Do not automatically roll back a database migration by deleting tables. First assess whether the schema is backward-compatible with the previous application.
3. Preserve logs, the migration output, and the backup identifier.
4. Restore the database only after confirming the restore point and impact with the maintainer responsible for production data.
5. Re-run the smoke checks against the restored or rolled-back service.
6. Record the failure and update the release checklist before attempting another deployment.

## 7. Ongoing operations

Monitor health status, process restarts, request failures, database latency, analytics ingestion failures, authentication rate-limit responses, and disk usage for uploads/logs. Rotate secrets deliberately, test backups at least periodically, and review dependencies through the project's normal update process.

The final release should be considered production-ready only after a staging run proves that the migration, secure-cookie behavior, analytics persistence, and rollback procedure work with the same platform configuration used in production.
