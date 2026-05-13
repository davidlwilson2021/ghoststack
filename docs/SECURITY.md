# Security Model

This document describes the threat model GhostStack is built against and the specific controls in place to mitigate each class of attack.

## Threat Model

The system is built assuming the following adversaries:

1. **Unauthenticated internet attackers** trying to use the app's features without permission
2. **Authenticated low-privilege users** trying to escalate to admin or access other users' data
3. **Brute-force attackers** trying to guess passwords
4. **Network observers** trying to intercept credentials or tokens
5. **Curious GitHub visitors** who can read the entire source code

The system is **not** built to defend against:

- Cloudflare account compromise (out of scope — that breaks every Cloudflare-hosted app)
- Compromise of the admin's local machine
- Sophisticated targeted attacks by nation-state actors
- Insider threats from approved admin users

## Controls

### Authentication

**Password storage:** Passwords are hashed with **PBKDF2** using:

- 100,000 iterations
- SHA-256 hash function
- Per-user salt (constructed from the email address)
- Base64-encoded output (256 bits)

The hash function uses the Web Crypto API's `crypto.subtle.deriveBits`, which runs natively in the Cloudflare Worker without any third-party dependency.

Password rules:

- Minimum 8 characters
- No maximum length
- No required character classes (length over complexity)
- Validated both client-side (UX) and server-side (security)

**Login flow:**

1. Client submits email and password over HTTPS
2. Worker looks up the user by lowercased email
3. Worker hashes the submitted password with the same salt
4. Worker compares the resulting hash with the stored one
5. On mismatch, a generic "Invalid email or password" error is returned (no enumeration)
6. On match, the Worker checks account status — pending/denied accounts cannot log in
7. On success, a fresh session token is created and returned

### Session Tokens

Tokens are:

- **256 bits** of cryptographically random data (`crypto.getRandomValues`)
- Hex-encoded (64 characters)
- Stored in the D1 `sessions` table with a 7-day expiry
- Sent on every authenticated request as `Authorization: Bearer <token>`

On the client, the token lives in `localStorage` as `gs-token`. On logout, the token is deleted from `localStorage` and the corresponding row is removed from the D1 sessions table.

Session validation on every authenticated route does a single SQL query that joins sessions and users, with the conditions:

```sql
WHERE s.token = ?
  AND s.expires_at > datetime('now')
```

It also checks that `users.status = 'approved'` — so suspending or denying a user immediately invalidates all their active sessions on the next request.

### Admin Approval

Account creation does **not** grant access. The flow is:

1. User submits a registration request
2. A row is created in `users` with `status = 'pending'`
3. The user gets a success message but cannot log in
4. An admin sees the pending request in their admin panel
5. Admin clicks Approve → status changes to `'approved'`
6. User can now log in

No anonymous self-service access. There is no public sign-up endpoint that grants immediate access — every account is gated by human review.

### Admin Bootstrapping

On every request, the Worker runs `seedAdmin()`:

- Checks if a user exists with the configured `ADMIN_EMAIL`
- If not, creates one with role `'admin'`, status `'approved'`, and a known default password

The default password is intended to be changed immediately on first login via the **Change Password** flow. The Worker enforces 8-character minimum on the new password.

The seed is idempotent — on every subsequent request, the existence check passes and no rows are created.

### CORS

The Worker's `Access-Control-Allow-Origin` is **not** wildcard. It is set per-request to match only:

- The exact production Pages domain
- Any preview subdomain of the Pages project (e.g., `feature-branch.ghoststack.pages.dev`)

Any other origin gets the production origin echoed back, which means the browser will block the response. Combined with `Access-Control-Allow-Credentials: true`, this prevents arbitrary third-party sites from making authenticated requests to the Worker.

### XSS (Cross-Site Scripting)

All data that originates from user input — Slack message text, user emails, display names, error messages — is **HTML-escaped** before being injected into the DOM. The frontend has a single `esc()` helper:

```js
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
```

This is the safest possible escape: it uses the browser's own DOM text-handling to produce the escaped form, so anything Slack returns (`<script>`, `<img onerror>`, etc.) becomes inert text.

Every `innerHTML` assignment in the codebase that touches user data wraps the values in `esc()`. Static template strings without user data don't need escaping.

Display names are **also** sanitized server-side at registration time (`escapeHtml` in the Worker) — defense in depth, in case a future code path renders the name without going through the frontend `esc()`.

### SQL Injection

Every D1 query uses **parameterized statements** via `.prepare(sql).bind(value)`. No SQL string is built by concatenation. The D1 driver handles escaping and binding, making SQL injection structurally impossible.

Example:

```js
await env.DB.prepare('SELECT * FROM users WHERE email = ?')
  .bind(email.toLowerCase())
  .first();
```

### Input Validation

The Worker validates every input on every endpoint before using it:

- Email format: regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`
- Password length: minimum 8 characters
- Display name: max 100 characters
- Required fields: explicit null/empty check with descriptive errors

Validation errors return HTTP 400 with a `{ok: false, error: "..."}` body. Authentication failures return 401, permission failures return 403, and "not found" returns 404.

### Secrets Management

No API keys, tokens, or sensitive credentials live in source code or in the frontend. All sensitive values are stored as **encrypted Cloudflare Worker secrets**:

| Secret | Purpose |
|---|---|
| `SLACK_BOT_TOKEN` | Slack Bot OAuth token (xoxb-...) for posting and fetching messages |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude requests |

Secrets are set via `wrangler secret put` and live encrypted in Cloudflare's storage. Once set they are **not retrievable** — not via the dashboard, not via the API, not via `wrangler`. They are only readable at runtime by the Worker code via the `env` parameter.

Environment variables (non-secret config) are in `wrangler.toml`:

- `ADMIN_EMAIL` — the email address that gets auto-seeded as the initial admin
- `CORS_ORIGIN` — the production origin allowed via CORS

These are visible in the dashboard but contain no sensitive data.

### Defense in Depth

Several controls overlap intentionally:

- **Display name escaping** — escaped both server-side at insert time and client-side at render time
- **Status checking** — checked both at login (no token issued for non-approved users) and on every authenticated request (existing tokens for suspended users immediately stop working)
- **CORS + Bearer tokens** — even if CORS were bypassed, the Bearer token wouldn't be sent automatically; an attacker would have to steal the token from `localStorage`, which requires either XSS (mitigated above) or compromise of the user's device

### What's Logged

The Worker currently does not write its own audit log. Cloudflare Workers has built-in request logging visible in the dashboard (request URL, status code, duration). This is enough for basic operational debugging but not for security audit.

A dedicated audit log table is on the Phase 2 roadmap (see the main README).

## Known Limitations and Future Hardening

These are not currently exploited vulnerabilities — they are known gaps where the current implementation could be hardened further:

1. **No rate limiting on auth endpoints.** A brute-force attempt against `/auth/login` is not throttled. Mitigation today: PBKDF2 is intentionally slow, accounts are gated by admin approval, and Cloudflare's underlying infrastructure has DDoS protection. Future: explicit per-IP login attempt counter in D1.

2. **No email verification at registration.** A user can register with any email address whether or not they control it. Mitigation today: admin approval ensures only known users get access. Future: email confirmation link before the request hits the admin queue.

3. **No two-factor authentication.** Admin accounts in particular would benefit from 2FA. Future: TOTP support for admin accounts.

4. **No session-revoke-all for password change.** Changing your password does not invalidate other active sessions. Future: delete all sessions for the user on password change.

5. **Default admin password is a known constant.** The initial admin password is `admin` and must be changed manually on first login. Future: require the admin to set the password during the first successful login (force-change-on-first-login flow).

6. **No audit log.** Sensitive events (logins, key changes, admin actions) are not currently recorded in a dedicated table. Cloudflare Workers logs are operational only. Future: dedicated `audit_log` table covering all sensitive actions.

7. **Tasks are not isolated per user yet.** All approved users share access to the same Slack channel via the proxy. This is fine for the original single-tenant deployment but is being addressed in Phase 2 with per-user D1 task storage.

## Reporting a Vulnerability

If you discover a security issue, please open a GitHub issue with the label `security` or contact the repository owner directly. Do not include exploit details in public-facing channels — file a private report first.
