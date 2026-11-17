# Essence security review

Review date: 2026-11-16

## What changed

- User and admin authentication now relies on separate `HttpOnly`, `SameSite=Strict` cookies. Browser code no longer reads or stores session tokens.
- Passwords are bcrypt-hashed. New and changed passwords require at least 12 characters; password reset links are single-use and expire after 30 minutes.
- Added same-origin checks for state-changing API requests, production HTTPS redirects, security headers including a Content Security Policy, and no-cache headers for admin/auth responses.
- Replaced the regular-expression post HTML filter with an allowlist HTML sanitizer. Escaped untrusted post/profile text before rendering.
- Added server-side bounds and checks to profile, comments, admin settings, and post input. SQL continues to use bound parameters.
- Fixed the subscriber admin page to use the server-issued cookie instead of looking for a JSON token, and removed unreferenced legacy browser scripts and unused packages.
- Upgraded vulnerable dependencies. `npm audit` reports zero vulnerabilities.
- Added a password reset flow. Configure an email provider (`SENDGRID_API_KEY` or `EMAIL_USER`/`EMAIL_PASSWORD`) for delivery.

## Remaining high-priority action

| Severity | Evidence | Risk in plain words | Required action |
|---|---|---|---|
| HIGH | Git history commits `12c1888dec8914c8ee578dea47f87be9e57b85f6` and `fb905ccfe4a066fcf3621bdea35c2ff4bdf3f178` contain credential-like values, including an admin password and a JWT signing secret, in committed setup/configuration material. | Old copies of the keys can still unlock the door if they are still active. Deleting them from today's files does not remove copies from Git history. | Immediately change the admin password and rotate `JWT_SECRET` and any provider credential confirmed real. Review provider and hosting logs. Removing the old values from public Git history requires a coordinated history rewrite and does not replace rotating them. This review did not change hosted secrets or rewrite shared history. |

## Scope and limitations

- The local `main` and `origin/main` refs were aligned; the local repository contained 137 commits. A credential-pattern search found the two commits above. This is not a guarantee against every possible secret format, fork, deleted ref, GitHub artifact, or secret-scanning alert.
- There is no payment/checkout or file-upload endpoint in the current app, so price verification and upload controls were not applicable.
- Public posts, comments, analytics summaries, and limited user profile fields are intentionally public. Subscriber email addresses and admin operations are protected by admin authentication. Public profile responses do not include email or password hashes.
- This repository does not show the actual Turso account permissions, production environment values, TLS configuration at the hosting provider, or deployed behavior. Verify least-privilege database credentials and HTTPS in the hosting dashboard.
- The test suite and JavaScript syntax checks passed, and the dependency audit reported zero advisories. HTTP/database integration tests against the live deployment were not run.

## Verification

- `npm test`: 76 tests passed.
- `npm audit`: zero vulnerabilities reported.
- `node --check` passed for changed JavaScript files.
- `git diff --check` passed; Git only warned that its configured line endings may be normalized.
