# GhostStack handoff — Windows desktop

**Date:** 2026-05-18  
**Repo:** https://github.com/davidlwilson2021/ghoststack  
**Production:** https://ghoststack.pages.dev  
**Worker:** https://ghoststack-proxy.greyhawkdiesel.workers.dev  

---

## What was completed (Mac session)

| Item | Status |
|------|--------|
| Worker deploy (`/version`, `/health`, `POST /tasks` server Slack mirror) | **Live** — build `2025-05-18-slack-mirror-v3` |
| Combined health `GET /api/health` (Pages + Worker) | **Working** |
| Manual `wrangler deploy` from `worker/` | **Done** |
| GitHub secret `CLOUDFLARE_API_TOKEN` | **Set** |
| GitHub Actions **Deploy Worker** workflow | **Green** (Wrangler 4, whoami + deploy + version check) |
| Slack EOD / duplicate-message investigation | **Closed** — reopen only if something regresses |
| Feature branch | `cursor/worker-ci-deploy` pushed; **PR #1 open** |

---

## Production verification (run anywhere)

```bash
curl -fsS "https://ghoststack-proxy.greyhawkdiesel.workers.dev/version"
curl -fsS "https://ghoststack-proxy.greyhawkdiesel.workers.dev/health"
curl -fsS "https://ghoststack.pages.dev/api/health"
```

**Expected:**

- `/version` → `"build":"2025-05-18-slack-mirror-v3"`, `"serverSlackMirror":true`
- `/health` → `"hasSlackToken":true` (and `hasMasterKey` if configured)
- `/api/health` → `worker.build` matches; **not** `"reachable":false`

In the app (admin): deploy hint should show **Worker build: 2025-05-18-slack-mirror-v3**.

---

## Git state when you pull

```
main                    → f46a3a2 (CI workflow + Wrangler 4 on main; already pushed)
cursor/worker-ci-deploy → 8d9f373 (same CI changes + .gitignore; PR #1)
```

**Note:** CI deploy changes exist on **both** `main` and the feature branch (different commit SHAs). Merging or closing PR #1 is optional cleanup — production does not depend on the PR.

```bash
git clone https://github.com/davidlwilson2021/ghoststack.git
cd ghoststack
git fetch origin
git checkout main          # or: git checkout cursor/worker-ci-deploy
git pull
```

PR: https://github.com/davidlwilson2021/ghoststack/pull/1  

---

## Windows setup (first time on that machine)

### 1. Tools

- [Node.js](https://nodejs.org/) (LTS)
- [Git](https://git-scm.com/)
- [GitHub CLI](https://cli.github.com/) (optional): `gh auth login`

### 2. Cloudflare / Wrangler auth

OAuth from Mac does **not** transfer. On Windows, either:

**A. OAuth (interactive)**

```powershell
cd ghoststack\worker
npx wrangler login
```

**B. API token (CI-style, good for scripts)**

1. Cloudflare → Profile → **API Tokens** → **Create Token** → template **Edit Cloudflare Workers**
2. `set CLOUDFLARE_API_TOKEN=your-token` (cmd) or `$env:CLOUDFLARE_API_TOKEN="..."` (PowerShell)
3. `npx wrangler whoami` in `worker\`

**Do not use** Global API Key — use **User API Token** only.

### 3. Deploy Worker (when you change `worker/` code)

```powershell
cd ghoststack\worker
npm install
npx wrangler deploy
```

**Important:** Run from `ghoststack\worker`, **not** from `~` or repo root (avoids `.Trash` / wrong-dir errors on Mac; same idea on Windows — use the `worker` folder).

### 4. Worker secrets (already set in Cloudflare; only if rotating)

```powershell
cd ghoststack\worker
npx wrangler secret put SLACK_BOT_TOKEN
npx wrangler secret put MASTER_KEY
```

Secrets persist in Cloudflare across deploys; redeploy not required after `secret put`.

### 5. GitHub Actions (already configured)

- Secret name: `CLOUDFLARE_API_TOKEN` (repo **Settings → Secrets → Actions**)
- Workflow: `.github/workflows/deploy-worker.yml`
- Triggers: push to `main` under `worker/**`, or **Actions → Deploy Worker → Run workflow**

```powershell
gh workflow run "Deploy Worker" --repo davidlwilson2021/ghoststack
gh run watch --repo davidlwilson2021/ghoststack
```

---

## Key paths & config

| What | Where |
|------|--------|
| Worker entry | `worker/src/index.js` |
| Build ID (bump on deploy) | `worker/src/lib/build.js` |
| Slack mirror | `worker/src/lib/slack.js` → `POST /tasks` in `worker/src/routes/tasks.js` |
| Combined health (Pages) | `functions/api/health.js` |
| Worker wrangler config | `worker/wrangler.toml` |
| Cloudflare account ID | `e9c5a793d46fd751dcb9e3b65620cb06` |
| D1 database | `ghoststack-auth` |
| Slack log channel (var) | `C0B0YHKH4QM` |
| Slack dispatch channel (var) | `C0B0LGLTLJK` |

---

## Architecture (quick)

```
Browser → ghoststack.pages.dev (static UI + Pages Functions)
              ↓
         ghoststack-proxy.workers.dev (API, D1, Slack mirror on POST /tasks)
              ↓
         D1 (ghoststack-auth) + Slack API
```

Pages `/api/health` calls Worker `GET /health` for the combined admin deploy hint.

---

## If something breaks

| Symptom | Check |
|---------|--------|
| Worker hint says “deploy for latest features” | `curl .../version` — 404 = old Worker; run `wrangler deploy` |
| CI fails `9106` Authentication failed | Re-create API token; `gh secret set CLOUDFLARE_API_TOKEN` (no trailing newline; use API Token not Global Key) |
| Tasks save but no Slack | `/api/health` → `slackReady`, `hasSlackToken`; test with **CHECK SLACK** in admin UI |
| `wrangler` permission / filesystem errors | `cd` into `ghoststack\worker` before any wrangler command |
| OAuth `localhost:8976` connection refused | Run `wrangler login` and **keep terminal open** until “Successfully logged in” |

Capture for Slack regressions: time, user, channel, `/api/health` JSON (no tokens).

---

## Optional next steps on Windows

1. Merge or close **PR #1** if you want a clean branch story.
2. Pull `main`, smoke-test: log in → add a task → confirm Slack mirror.
3. Add `docs/HANDOFF-windows-desktop.md` to git if you want it in the repo (this file).

---

## Mac-specific notes (for context)

- Wrangler OAuth was refreshed via `wrangler login` (callback on port **8976**).
- Failed OAuth earlier when the login process exited before the browser callback.
- `CLOUDFLARE_API_TOKEN` in GitHub was fixed with a valid **User API Token** (second paste succeeded; CI run **26062778255** passed).

---

*Generated for handoff from Mac → Windows. No secrets are stored in this file.*
