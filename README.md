# GhostStack G6 Ops Dashboard

A secure, auth-gated operations dashboard for automating Daily Work Call emails. Log tasks throughout the day by G6 objective category, generate a formatted UNCLASSIFIED Daily Work Call via Claude AI, and post directly to Slack.

**Live:** https://ghoststack.pages.dev

---

## Architecture

```
Browser (ghoststack.pages.dev)
    |
Cloudflare Pages (static HTML)
    |
Cloudflare Worker (ghoststack-proxy) ── auth + proxy
    |                |              |
  D1 Database    Slack API     Claude API
  (sessions/     (post/fetch    (generate
   users)        messages)      EOD draft)
```

All API keys and tokens are stored as Cloudflare Worker secrets. Nothing sensitive is in the frontend code or this repository.

---

## Stack

| Layer | Tool | Purpose |
|---|---|---|
| Frontend | HTML / CSS / JS | Single-file dashboard UI |
| Hosting | Cloudflare Pages | Static hosting, auto-deploys from GitHub `main` |
| Auth + Proxy | Cloudflare Worker | Session auth, user management, API proxy |
| Database | Cloudflare D1 | User accounts, sessions (SQLite) |
| Messaging | Slack API | Post and fetch messages from workspace channels |
| AI | Claude API (Sonnet) | Generate formatted Daily Work Call emails |

---

## Authentication

All features require authentication. The system uses:

- **PBKDF2** password hashing (100,000 iterations, SHA-256) via the Web Crypto API
- **256-bit cryptographically random** session tokens with 7-day expiry
- **Admin approval workflow** — new account requests go to `pending` status until an admin approves or denies them
- **CORS restricted** to the Pages domain only
- **XSS protection** — all user-supplied data is HTML-escaped before rendering

### User Roles

| Role | Access |
|---|---|
| `admin` | Full dashboard + user management panel (approve/deny/delete users) |
| `user` | Dashboard features only (log tasks, generate EOD, fetch log) |

---

## Dashboard Modes

**Log Task** — Select a G6 objective category, type a task, and post it to `#daily-work-log` via the Cloudflare Worker proxy.

**Generate EOD** — Fetches today's logged tasks from Slack, sends them to Claude, and generates a formatted UNCLASSIFIED Daily Work Call email ready to copy or post to `#claude-dispatch`.

**Fetch Log** — Pulls recent messages from `#daily-work-log` for review.

**Admin** *(admin only)* — Manage user accounts: approve pending requests, revoke access, or delete users.

---

## Worker API Routes

All routes are served by the Cloudflare Worker at the proxy URL.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/register` | No | Create a pending account |
| `POST` | `/auth/login` | No | Authenticate and get session token |
| `GET` | `/auth/session` | Yes | Validate current session |
| `POST` | `/auth/logout` | Yes | Destroy session |
| `POST` | `/auth/change-password` | Yes | Update password |
| `GET` | `/admin/users` | Admin | List users (filterable by status) |
| `POST` | `/admin/approve` | Admin | Approve a pending user |
| `POST` | `/admin/deny` | Admin | Deny or revoke a user |
| `POST` | `/admin/delete` | Admin | Delete a non-admin user |
| `POST` | `/log` | Yes | Post message to Slack channel |
| `GET` | `/history` | Yes | Fetch channel message history |
| `POST` | `/claude` | Yes | Proxy request to Claude API |

---

## Local Development

The frontend is a single `index.html` file with no build step. To run locally:

```bash
python3 -m http.server 8090 --directory .
```

Then open http://localhost:8090. Note: API calls will still go to the production Worker.

### Deploying the Worker

```bash
cd worker
npx wrangler deploy
```

Worker secrets (`SLACK_BOT_TOKEN`, `ANTHROPIC_API_KEY`) are configured via `wrangler secret put`.

---

## Deployment

- **Frontend**: Push to `main` on GitHub. Cloudflare Pages auto-deploys within ~60 seconds.
- **Worker**: Run `npx wrangler deploy` from the `worker/` directory.

---

## Security Notes

- All API keys and tokens are stored as Cloudflare Worker **secrets** — they never appear in source code or the frontend
- CORS is restricted to the production Pages domain
- Passwords are hashed with PBKDF2 (100k iterations) — never stored in plaintext
- Session tokens are 256-bit cryptographically random with automatic expiry
- All user-rendered content is HTML-escaped to prevent XSS
- The D1 database uses parameterized queries to prevent SQL injection
- Account creation requires admin approval — no self-service access

---

## Built With

- [Cloudflare Workers](https://workers.cloudflare.com)
- [Cloudflare Pages](https://pages.cloudflare.com)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Slack API](https://api.slack.com)
- [Claude API](https://anthropic.com)

---

*GhostStack — built by David Wilson, [redacted]*
