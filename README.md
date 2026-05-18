# GhostStack G6 Ops Dashboard

A secure, auth-gated operations dashboard that automates the daily End-of-Day (EOD) workflow for IT operations staff. Log tasks throughout the day by category, generate a properly formatted Daily Work Call email using Claude AI, and post the result directly to Slack — all from a single browser tab.

**Live:** https://ghoststack.pages.dev

---

## What Problem Does This Solve?

Writing the same structured status email every day takes time and is easy to forget. Tasks get lost between meetings, formatting has to be exact, and trying to reconstruct what you actually did at 4:55 PM is a daily friction point.

GhostStack flips the workflow: log tasks the moment you complete them (one tap on a phone), and at end-of-day press a single button to generate a polished email. Claude takes the raw logged tasks and produces a formatted Daily Work Call ready to copy into Outlook or post into Slack.

The system is built to be fully secure and multi-user: every account is gated behind admin approval, all API keys are server-side secrets, and every feature requires authentication.

---

## Features

- **Auth-gated access** — no feature is reachable without signing in
- **Admin approval workflow** — new account requests sit in `pending` until an admin approves or denies
- **Task logging by category** — tag tasks against G6 objective categories with one click
- **AI-generated EOD emails** — Claude produces a properly formatted Daily Work Call from your logged tasks
- **Slack integration** — tasks post to a Slack channel; EOD drafts post to a separate channel
- **Channel history viewer** — pull and review recent messages directly in the dashboard
- **User management panel** — admins can approve, deny, revoke, or delete users
- **Change password** — built-in password change flow from the user menu
- **Mobile-friendly** — works as a Progressive Web App; add to home screen and it opens like a native app

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| Frontend | HTML / CSS / vanilla JS | Single-file dashboard UI |
| Hosting | Cloudflare Pages | Static hosting with auto-deploy from `main` |
| Backend | Cloudflare Workers | Auth, user management, and API proxy |
| Database | Cloudflare D1 | SQLite-based user accounts and sessions |
| AI | Claude API (Sonnet) | Daily Work Call generation |
| Messaging | Slack API | Posting and fetching channel messages |
| Auth | Web Crypto API | PBKDF2 password hashing, random session tokens |
| CI/CD | GitHub + Cloudflare Pages | Push to `main` auto-deploys |

---

## Architecture

```
                      Browser
                         |
                         v
          +----------------------------+
          |   Cloudflare Pages         |
          |   (static dashboard HTML)  |
          +----------------------------+
                         |
                         | HTTPS (Bearer token)
                         v
          +----------------------------+
          |   Cloudflare Worker        |
          |   (auth + proxy)           |
          +----------------------------+
              |          |          |
              v          v          v
        +--------+   +--------+   +--------+
        |   D1   |   | Slack  |   | Claude |
        |  (DB)  |   |  API   |   |  API   |
        +--------+   +--------+   +--------+
```

The Cloudflare Worker is the heart of the system. It:

1. Authenticates every request via session token
2. Manages user accounts in D1 (registration, approval, sessions)
3. Proxies authorized requests to Slack and Claude
4. Holds all sensitive credentials as encrypted secrets — nothing sensitive ever reaches the browser

For a detailed walkthrough of how each component works, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## How It Works

### Signing in
A new user requests access by filling in name, email, and password on the dashboard. The request hits `/auth/register` and creates a `pending` row in D1. An admin sees the pending request in the admin panel and approves it. The user can then sign in.

### Logging a task
While signed in, the user picks a category (Tier 2 / Tech / Cyber / Training), types a task, and presses POST. The request goes to `/log` on the Worker, which verifies the session token and forwards the message to Slack using the bot token stored as a Worker secret. The browser never sees the Slack token.

### Generating an EOD
The user presses **Generate Daily Work Call**. The Worker:

1. Fetches today's tasks from the Slack channel via `/history`
2. Sends them to Claude via `/claude` with a structured prompt
3. Returns the generated email to the browser

The user can copy the result to Outlook or post it directly to a different Slack channel.

For the full request-by-request flow, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Project Structure

```
ghoststack/
├── index.html                  Frontend dashboard (single-file SPA)
├── README.md                   This file
├── docs/
│   ├── ARCHITECTURE.md         Deep dive on how the system works
│   ├── SECURITY.md             Threat model and security controls
│   └── API.md                  Worker API reference
└── worker/
    ├── wrangler.toml           Worker config (D1 binding, env vars)
    ├── package.json
    └── src/
        └── index.js            All Worker routes (auth + proxy)
```

The frontend is a single self-contained `index.html` file with inline CSS and JS — no build step.

The Worker is a single ES module that handles every route. It's intentionally compact so it stays easy to audit.

---

## Security

GhostStack is built to be safely public. Key controls:

- All API keys live as **encrypted Cloudflare Worker secrets** — never in source, never in the frontend
- Passwords hashed with **PBKDF2** (100,000 iterations, SHA-256) via the Web Crypto API
- **256-bit cryptographically random** session tokens with 7-day automatic expiry
- **Admin approval workflow** — no anonymous self-service access
- **CORS locked** to the production Pages domain only
- All user-supplied content is **HTML-escaped** before rendering (XSS protection)
- D1 queries use **parameterized statements** (SQL injection protection)
- Server-side input validation on every endpoint

For the full threat model and per-control breakdown, see [docs/SECURITY.md](docs/SECURITY.md).

---

## Local Development

The frontend has no build step. To run locally:

```bash
python3 -m http.server 8090 --directory .
```

Open http://localhost:8090. Frontend API calls will still go to the production Worker (unless you redirect them to a local dev Worker).

### Worker development

```bash
cd worker
npx wrangler dev
```

Requires `wrangler` (`npm install -g wrangler`) and a Cloudflare account with the D1 database configured.

---

## Deployment

### Frontend

Push to `main` on GitHub → Cloudflare Pages auto-deploys within ~60 seconds. No build step.

### Worker

```bash
cd worker
npx wrangler deploy
```

Worker secrets (`SLACK_BOT_TOKEN`, `ANTHROPIC_API_KEY`) are configured via `wrangler secret put` and live encrypted in Cloudflare. They are never visible after being set.

**GitHub Actions (optional):** Push to `main` under `worker/` auto-deploys when the repo secret `CLOUDFLARE_API_TOKEN` is set (Cloudflare dashboard → API Tokens → **Edit Cloudflare Workers** template). Add it:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo davidlwilson2021/ghoststack
```

Then trigger a deploy from the Actions tab (**Deploy Worker** → **Run workflow**) or push a change under `worker/`.

---

## Documentation

| File | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, component responsibilities, data flow, database schema |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, authentication design, all security controls |
| [docs/API.md](docs/API.md) | Worker API reference — every endpoint, request shape, response shape |

---

## Roadmap

**Phase 2 — Multi-tenant SaaS conversion** (in design):

- Per-user task storage in D1 (currently shared via Slack)
- Per-user template configuration (currently hardcoded G6 format)
- Per-user API keys (each user provides their own Claude key, stored encrypted)
- Email delivery via Resend (currently EOD is copy-paste to Outlook)
- Configurable per-send recipients (CC supervisor, team lead, etc.)
- Optional auto-scheduling (e.g., daily 5 PM auto-send)
- Optional per-user Slack workspace connection
- Admin Monitor dashboard (all-task view, audit log, EOD history, user activity)
- User suspension capability (alongside approve/deny/delete)

---

## Built With

- [Cloudflare Workers](https://workers.cloudflare.com)
- [Cloudflare Pages](https://pages.cloudflare.com)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Slack API](https://api.slack.com)
- [Anthropic Claude API](https://www.anthropic.com)

---

*GhostStack — built by David Wilson*
