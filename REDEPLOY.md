# GhostStack — Redeploy & Key Rotation Checklist

> **Use this when rotating secrets or deploying to a fresh environment.**  
> Template for all secrets: `worker/.dev.vars.example`

---

## Step 1 — Generate a new MASTER_KEY

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

⚠️ **MASTER_KEY warning:** Changing this invalidates every user's saved AI key in the database.  
After rotating, all users must re-enter their API keys in Settings. That's expected — tell them.

---

## Step 2 — Set all production secrets via Wrangler

Run each command and paste the new value when prompted:

```bash
cd C:/dev/ghoststack/worker

npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put MASTER_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL
npx wrangler secret put SLACK_BOT_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY

# Optional — only needed if cost alert Slack DMs are wanted:
npx wrangler secret put COST_ALERT_SLACK_CHANNEL

# Optional — only needed to allow Opus model in Settings:
# npx wrangler secret put ALLOW_OPUS   (value: true)
```

Verify secrets are set:
```bash
npx wrangler secret list
```

---

## Step 3 — Set up local dev (if needed)

```bash
cp worker/.dev.vars.example worker/.dev.vars
# Edit worker/.dev.vars with real values
```

---

## Step 4 — Run migrations (if DB is fresh or behind)

```bash
# Local:
npx wrangler d1 migrations apply ghoststack-auth --local

# Production:
npx wrangler d1 migrations apply ghoststack-auth
```

---

## Step 5 — Deploy

```bash
cd C:/dev/ghoststack/worker
npx wrangler deploy
```

---

## Step 6 — Smoke test after deploy

| Check | Expected |
|-------|----------|
| `GET /auth/session` with no token | `401 Not authenticated` |
| `POST /auth/login` with admin creds | `200 + token` |
| `GET /admin/users` with admin token | `200 + user list` |
| `GET /settings` with user token | `200 + settings object` |
| `POST /eod/generate` with tasks logged | `200 + draft` |

---

## What changed in this deploy (May 2026)

- **seed.js:** Admin password now reads from `ADMIN_PASSWORD` secret — no more hardcoded `'admin'`
- **.gitignore:** Added (was missing) — `.dev.vars`, `.wrangler/`, `node_modules/` now ignored
- **Audit:** Full code audit completed — see `docs/SECURITY.md` for issue list and status
