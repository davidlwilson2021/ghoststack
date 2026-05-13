# Architecture

This document explains how GhostStack is built — what each component does, how they talk to each other, and why each piece exists.

## System Overview

```
                  +-------------------+
                  |   Web Browser     |
                  | (mobile/desktop)  |
                  +-------------------+
                           |
                           | HTTPS
                           v
            +-----------------------------+
            |   Cloudflare Pages          |
            |   ghoststack.pages.dev      |
            |                             |
            |   Serves single-file SPA    |
            |   (index.html, ~46 KB)      |
            +-----------------------------+
                           |
                           | API calls
                           | with Bearer token
                           v
            +-----------------------------+
            |   Cloudflare Worker         |
            |   *-proxy.workers.dev       |
            |                             |
            |  - Auth middleware          |
            |  - User management          |
            |  - Slack proxy              |
            |  - Claude proxy             |
            +-----------------------------+
                |          |          |
                v          v          v
           +--------+ +--------+ +----------+
           |   D1   | |  Slack | |  Claude  |
           |   DB   | |   API  | |    API   |
           +--------+ +--------+ +----------+
```

## Components

### 1. The Frontend (`index.html`)

A single self-contained HTML file. No build step, no framework, no external JS bundles. Inline CSS uses CSS custom properties for theming (the "Base Layer Labs" copper/gold palette). Inline JS handles all UI state and API calls.

**Why single-file?** Speed and simplicity. The whole thing loads in one request, deploys via a single `git push`, and is trivial to audit. There's no React/Vue toolchain to maintain.

**State management:** plain JavaScript variables and `localStorage` for the session token. The token (`gs-token`) is the only persistent client-side state.

**Two screens, controlled by display toggling:**

- `#auth-screen` — sign-in / request-access (default if no valid session)
- `#app-screen` — full dashboard (only shown after successful auth)

The session check on page load determines which screen renders.

### 2. The Cloudflare Worker (`worker/src/index.js`)

The Worker is the only place secrets and protected logic live. It runs serverless on Cloudflare's edge, close to the user. It:

- Receives every API request from the dashboard
- Validates the Bearer session token against the D1 sessions table
- Routes the request to the right handler
- For protected routes, calls Slack or Anthropic with stored secrets and proxies the response

Routes are organized into three groups in code:

1. **Auth routes** (`/auth/*`) — registration, login, logout, session check, change password. No prior session required (login itself creates one).
2. **Admin routes** (`/admin/*`) — list, approve, deny, delete users. Require an admin session.
3. **Protected proxy routes** (`/log`, `/history`, `/claude`) — require any valid session. Forward to Slack or Claude using server-side secrets.

### 3. Cloudflare D1 Database

A SQLite database living on Cloudflare's edge. Two tables today:

#### `users` table

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `email` | TEXT UNIQUE | Lowercased before insert |
| `password_hash` | TEXT | PBKDF2 output, base64-encoded |
| `display_name` | TEXT | HTML-escaped before insert |
| `role` | TEXT | `'admin'` or `'user'` |
| `status` | TEXT | `'pending'`, `'approved'`, or `'denied'` |
| `created_at` | TEXT | ISO datetime, default `now` |
| `updated_at` | TEXT | ISO datetime |

#### `sessions` table

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `token` | TEXT UNIQUE | 256-bit random hex string |
| `user_id` | INTEGER FK | References `users.id` |
| `expires_at` | TEXT | ISO datetime, 7 days from creation |
| `created_at` | TEXT | ISO datetime |

Sessions are validated on every authenticated request by joining `sessions` and `users`, checking `expires_at > now()` and `users.status = 'approved'`.

### 4. Slack API

The Worker holds a single Slack Bot OAuth token (`xoxb-...`) as a secret. Two Slack API operations are proxied:

- `chat.postMessage` — when the user posts a task or an EOD draft
- `conversations.history` — when the user fetches recent messages or generates an EOD

The bot must be invited to any channel it operates on. The frontend never sees the bot token.

### 5. Claude API

The Worker holds a single Anthropic API key as a secret. One Claude operation is proxied:

- `POST /v1/messages` with `claude-sonnet-4-20250514`, max 2048 tokens

The user-visible "Generate EOD" button triggers this. The Worker forwards the constructed prompt to Claude and streams the response back.

## Request Flows

### Flow 1: User registration and approval

```
User                 Browser           Worker                D1
 |                      |                |                    |
 |--Submit form-------->|                |                    |
 |                      |--POST /auth/register-------->|     |
 |                      |                |--INSERT users----->|
 |                      |                |  (status=pending)  |
 |                      |<--{ok:true}----|                    |
 |<--"Request submitted"|                |                    |
 |                                                            |
 |  ... later, admin logs in ...                              |
 |                                                            |
 |--Click APPROVE------>|                |                    |
 |                      |--POST /admin/approve--------->|     |
 |                      |  (with userId) |--UPDATE users----->|
 |                      |                |  (status=approved) |
 |                      |<--{ok:true}----|                    |
 |<--"User approved"----|                |                    |
```

The first time the Worker boots in a fresh D1 instance, `seedAdmin()` runs and creates the configured admin account with a default password. This runs on every request defensively (an existence check makes it idempotent and cheap).

### Flow 2: Login

```
User                 Browser              Worker              D1
 |                      |                   |                  |
 |--Submit credentials->|                   |                  |
 |                      |--POST /auth/login------------------>|
 |                      |                   |--SELECT user---->|
 |                      |                   |  by email        |
 |                      |                   |<--user row-------|
 |                      |                   |                  |
 |                      |             [hash password,          |
 |                      |              compare with stored]    |
 |                      |                   |                  |
 |                      |                   |--INSERT session->|
 |                      |                   |  (256-bit token, |
 |                      |                   |   7-day expiry)  |
 |                      |                   |                  |
 |                      |<--{token, user}---|                  |
 |                      |                   |                  |
 |                  [Store token in         |                  |
 |                   localStorage]          |                  |
 |                  [Render app screen]     |                  |
```

### Flow 3: Logging a task

```
User             Browser            Worker            Slack
 |                  |                  |                |
 |--Type, POST----->|                  |                |
 |                  |--POST /log------>|                |
 |                  |  (Bearer token)  |                |
 |                  |                  |--Validate------|
 |                  |                  |  session vs D1 |
 |                  |                  |                |
 |                  |                  |--POST -------->|
 |                  |                  |  chat.postMessage
 |                  |                  |  (bot token)   |
 |                  |                  |<---ok----------|
 |                  |<--Slack response-|                |
 |<--"Task logged"--|                  |                |
```

### Flow 4: Generating an EOD

```
User           Browser             Worker            Slack      Claude
 |                |                   |                |           |
 |--Click GEN---->|                   |                |           |
 |                |--GET /history---->|                |           |
 |                |  (today's msgs)   |--conversations.history--->|
 |                |                   |<--messages-----|           |
 |                |<--msgs------------|                |           |
 |                |                   |                |           |
 |                |--POST /claude---->|                |           |
 |                |  (built prompt)   |--POST /v1/messages-------->|
 |                |                   |<--generated text---------|
 |                |<--Claude response-|                |           |
 |                |                   |                |           |
 |          [Render draft in          |                |           |
 |           output panel]            |                |           |
 |<--Draft shown--|                   |                |           |
```

## Auto-Deploy Pipeline

```
Local edit                Push to GitHub             Cloudflare
on index.html        ->   `git push origin main` ->  Pages detects push
                                                          |
                                                          v
                                                    Builds & deploys
                                                    (no build step)
                                                          |
                                                          v
                                                    Live in ~60 sec
                                                    at ghoststack.pages.dev
```

The Worker deploys separately via `wrangler deploy` from the `worker/` directory.

## Technology Decisions

**Why Cloudflare end-to-end?** Free tier covers this entire stack. No vendor sprawl. The Worker, D1, and Pages are all in the same dashboard with the same auth. Edge-hosted means low latency from anywhere.

**Why no JS framework?** A status dashboard is roughly 5 forms, 4 buttons, and one table. Adding React would mean adding a build step, dependency management, and 200 KB of runtime for no functional benefit. Vanilla JS keeps the file under 50 KB, loads instantly, and is auditable.

**Why D1 instead of KV?** Two reasons: relational queries (joining sessions with users), and SQL is well-understood for parameterized inputs (SQL injection protection). KV is faster for pure key-value but doesn't fit this shape.

**Why PBKDF2 over bcrypt/argon2?** PBKDF2 is built into the Web Crypto API and runs natively in the Worker without WASM or polyfills. 100k iterations of SHA-256 is sufficient for this threat model (it's not a public-facing password leak scenario — the database is private and the salt is per-user).

**Why session tokens in `localStorage` instead of cookies?** Simplicity. No need for CSRF token handling because the Bearer header isn't sent automatically by the browser, and CORS already restricts what origins can call the Worker. Trade-off: any XSS on the page could read the token — mitigated by aggressive HTML escaping on all user-rendered content.

## Future Architecture Changes

See the Roadmap section in the [main README](../README.md) for Phase 2 plans, which include a major shift: tasks move from Slack (shared) to D1 (per-user), each user provides their own Claude API key (encrypted at rest), and EODs are delivered via Resend instead of copy-paste.
