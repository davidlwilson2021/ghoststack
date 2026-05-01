# 👻 GhostStack
### G6 Ops Dashboard — Daily Work Call Automation System

> Built by David Wilson | [redacted] | [redacted] | [redacted]  
> Stack: Slack API · Cloudflare Workers · Cloudflare Pages · GitHub · Claude AI

---

## What Is This?

GhostStack is a personal ops dashboard I built to solve a real problem — I was spending way too much time at EOD trying to remember everything I did throughout the day to write my Daily Work Call email. Tasks were falling through the cracks, the format had to be exact, and doing it manually every single day was getting old fast.

So I built a system. Log tasks throughout the day by category, hit one button at EOD, and Claude pulls everything together into a properly formatted UNCLASSIFIED Daily Work Call email ready to copy into Outlook. The whole thing runs in the browser, works on my phone from anywhere, and auto-deploys whenever I push a change to GitHub.

It's also a living project — I'm an [redacted] at [redacted] and this thing is going to keep growing as I learn more about APIs, automation, and data pipelines.

---

## Architecture

```
📱 Phone / Browser (ghoststack.pages.dev)
        ↓
🌐 Cloudflare Pages  (hosts the dashboard HTML)
        ↓
⚡ Cloudflare Worker  (ghoststack-proxy.greyhawkdiesel.workers.dev)
        ↓
    ┌───────────────────────────┐
    │                           │
📨 Slack API              🤖 Claude API
(post/fetch messages)    (generate EOD draft)
    │                           │
#daily-work-log         #claude-dispatch
```

The Cloudflare Worker is the key piece here — it acts as a server-side proxy between the browser and both the Slack API and Claude API. Browsers block direct JavaScript calls to external APIs because of CORS (Cross-Origin Resource Sharing) security policy. Running everything through the Worker sidesteps that entirely because the Worker lives server-side where those restrictions don't apply.

**This is why ALL API calls route through the Worker — both Slack and Claude.**

---

## The Full Stack

| Layer | Tool | Purpose |
|---|---|---|
| Frontend | HTML/CSS/JS | Dashboard UI |
| Hosting | Cloudflare Pages | Serves the dashboard globally |
| Proxy | Cloudflare Worker | Handles ALL API calls server-side (Slack + Claude) |
| Messaging | Slack API | Posts and fetches messages from channels |
| AI | Claude API (Sonnet) | Generates formatted Daily Work Call emails |
| Version Control | GitHub (private) | Source of truth, triggers auto-deploy |
| Bot | GhostBot (Slack App) | Authenticated Slack bot posting to channels |

---

## Slack Workspace Setup

**Workspace:** GhostStack  
**Account:** greyhawkdiesel@gmail.com  
**Plan:** Pro  

### Channel Structure

All channels are **Public** within the workspace (no external access — public just means no invite friction for the bot).

```
📡 G6 OPS
  ├── #daily-work-log       ← tasks get logged here throughout the day
  ├── #tier2-tickets        ← imaging, AV, [redacted], [redacted] notes
  ├── #cyber-governance     ← SCIF, SIPR, policy items
  └── #g6-meetings          ← sync notes, bi-weekly agenda items

🎓 [redacted]
  ├── #dsc-550              ← current course (Data Mining, R/RStudio)
  ├── #assignments          ← due dates and submission status
  ├── #study-notes          ← concepts, flashcards, lecture summaries
  └── #capstone-prep        ← long-range DSC/590 planning

⚙️ GHOSTSTACK
  ├── #claude-dispatch      ← where Claude posts generated EOD drafts
  ├── #reminders            ← grocery pings, Schwab rotation, alerts
  └── #scratch              ← raw ideas, links, quick notes
```

### GhostBot Setup

1. Go to https://api.slack.com/apps
2. Create New App → From scratch → Name: `GhostBot` → Workspace: `GhostStack`
3. OAuth & Permissions → Bot Token Scopes → Add these scopes:

```
channels:read       — see public channels
channels:history    — read messages in channels
chat:write          — post messages as GhostBot
im:write            — send direct messages
users:read          — identify users in workspace
```

4. Install to Workspace → Allow
5. Copy the **Bot User OAuth Token** (`xoxb-...`) — this goes in the Worker
6. Invite GhostBot to every channel via channel Settings → Integrations → Add an App

---

## Cloudflare Worker (Proxy)

**Worker name:** `ghoststack-proxy`  
**URL:** `https://ghoststack-proxy.greyhawkdiesel.workers.dev`  
**Account:** redacted@example.com's Account  

### Why a Proxy?

The dashboard is a browser-based HTML file. Browsers enforce CORS policy which blocks JavaScript from making direct API calls to external services like Slack and Anthropic. The Cloudflare Worker runs server-side so it doesn't have that restriction — the browser calls the Worker, the Worker calls the API, and the response comes back clean.

**Both Slack and Claude API calls go through the Worker. This is critical — if you ever try to call either API directly from the browser it will fail with a network/CORS error.**

### Worker Endpoints

| Method | Path | What it does |
|---|---|---|
| `POST` | `/log` | Posts a message to a Slack channel |
| `GET` | `/history` | Fetches message history from a channel |
| `POST` | `/claude` | Proxies Claude API calls server-side |
| `OPTIONS` | `*` | Handles CORS preflight requests |

### Worker Code

```javascript
const SLACK_TOKEN = 'YOUR_BOT_TOKEN_HERE';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && path === '/log') {
      const body = await request.json();
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SLACK_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: body.channel, text: body.text }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    if (request.method === 'GET' && path === '/history') {
      const channel = url.searchParams.get('channel');
      const oldest = url.searchParams.get('oldest') || '';
      const limit = url.searchParams.get('limit') || '50';
      let slackUrl = `https://slack.com/api/conversations.history?channel=${channel}&limit=${limit}`;
      if (oldest) slackUrl += `&oldest=${oldest}`;
      const res = await fetch(slackUrl, {
        headers: { 'Authorization': `Bearer ${SLACK_TOKEN}` },
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    if (request.method === 'POST' && path === '/claude') {
      const body = await request.json();
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': body.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: body.messages,
        }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};
```

### Deploying / Updating the Worker

1. Go to https://dash.cloudflare.com
2. Workers & Pages → `ghoststack-proxy` → Edit Code
3. Paste updated code → Deploy

---

## Dashboard

**File:** `index.html`  
**Live URL:** https://ghoststack.pages.dev  
**Local backup:** `ghoststack-dashboard.html`  

### Three Modes

**📡 LOG TASK**  
Select a G6 objective category, type the task, hit POST. Sends directly to `#daily-work-log` via the Cloudflare Worker proxy. Tasks display in the local feed with a timestamp and color-coded category border.

Categories map to the four G6 objectives:
- `TIER 2 SYS ADMIN` → Objective 1
- `TECH REQUIREMENTS` → Objective 2  
- `CYBER GOVERNANCE` → Objective 3
- `TRAINING` → Objective 4

**📋 GENERATE EOD**  
Fetches all tasks logged today from `#daily-work-log` (filtered by today's timestamp), sends them to Claude through the `/claude` Worker endpoint, and generates a properly formatted UNCLASSIFIED Daily Work Call email. Draft appears in the output panel ready to copy or post directly to `#claude-dispatch`.

**📥 FETCH LOG**  
Pulls the last 30 messages from `#daily-work-log` and displays them in the feed. Good for reviewing what's been logged before generating the EOD.

### Daily Work Call Format

The Claude prompt enforces this exact format every time:

```
UNCLASSIFIED

SUBJECT: Daily Work Summary - [redacted] - UNCLASSIFIED - [UNCLASSIFIED]

Good morning/afternoon,

This is my daily work call for [DATE].

––––––––––––––––––––––––––––
Objective 1 – Tier 2 Sys Admin
––––––––––––––––––––––––––––
- [tasks]

––––––––––––––––––––––––––––
Objective 2 – Tech Requirements
––––––––––––––––––––––––––––
- [tasks]

––––––––––––––––––––––––––––
Objective 3 – Cyber Security Governance
––––––––––––––––––––––––––––
- [tasks]

––––––––––––––––––––––––––––
Objective 4 – Professional/Training
––––––––––––––––––––––––––––
- [tasks — always includes [redacted]]

V/R,
David Wilson
[redacted]
[redacted] | [redacted]
[redacted]
[redacted]

UNCLASSIFIED
```

---

## GitHub + Cloudflare Pages CI/CD

**Repo:** `davidlwilson2021/ghoststack` (Private)  
**Pages URL:** https://ghoststack.pages.dev  
**Branch:** `main`  
**Build command:** none — pure static HTML, no build step needed  

### How Auto-Deploy Works

Every time I push a change to the `main` branch on GitHub, Cloudflare Pages automatically pulls the latest code and redeploys within about 60 seconds. No manual uploads, no CLI commands — just commit and push.

### Updating the Dashboard

1. Edit `index.html` locally or directly in GitHub
2. Commit to `main`
3. Cloudflare Pages detects the push and auto-deploys
4. Live at https://ghoststack.pages.dev within ~60 seconds

---

## Channel IDs Reference

```
#daily-work-log    → C0B0YHKH4QM
#claude-dispatch   → C0B0LGLTLJK
```

To find other channel IDs: open Slack in the browser → click the channel → copy the `C...` code from the URL.

---

## Troubleshooting

### ⚠️ Network Error / CORS Error on any button
**Cause:** A fetch call is hitting an external API directly from the browser instead of going through the Worker.  
**This applies to BOTH Slack and Claude API calls.**  
**Fix:** Make sure all calls in `index.html` use `PROXY/log`, `PROXY/history`, or `PROXY/claude` — never call `slack.com/api` or `api.anthropic.com` directly from the browser.

> **What we fixed:** The EOD Generator was originally calling the Anthropic API directly from the browser. Added a `/claude` endpoint to the Worker so Claude calls are also proxied server-side. Updated `index.html` to route `generateEOD()` through `${PROXY}/claude` instead of `https://api.anthropic.com/v1/messages`.

### Slack returns `{ ok: false, error: "..." }`

| Error | Cause | Fix |
|---|---|---|
| `invalid_auth` | Bad or expired bot token | Regenerate at api.slack.com → GhostBot → OAuth & Permissions |
| `channel_not_found` | Wrong channel ID | Double-check channel IDs from browser URL |
| `not_in_channel` | GhostBot not invited | Channel → Integrations → Add GhostBot |
| `missing_scope` | Bot missing permissions | Add scope at api.slack.com → GhostBot → OAuth & Permissions |

### EOD generator returns empty draft
**Cause:** No tasks logged today in `#daily-work-log`.  
**Fix:** Log at least one task before generating EOD. History fetch filters by today's timestamp only.

### Pages site not updating after GitHub push
**Fix:** Cloudflare Dashboard → Workers & Pages → ghoststack → Deployments → check build logs.

---

## Security Notes

- The Slack bot token (`xoxb-...`) is hardcoded in the Worker — Worker code isn't publicly visible but the better long-term move is to store it as a **Worker environment variable** (Settings → Variables) and reference as `env.SLACK_TOKEN`.
- The Anthropic API key is in `index.html` — keep the GitHub repo **Private**.
- Regenerate both keys periodically at api.slack.com and console.anthropic.com.

---

## Roadmap / Future Improvements

- [ ] Move Slack token to Cloudflare Worker environment variable
- [ ] Move Anthropic API key to Cloudflare Worker environment variable
- [ ] Add PWA manifest so GhostStack installs like a native app on iPhone
- [ ] [redacted] tracker — pull due dates and log study sessions
- [ ] BOD generator — morning version that pre-fills recurring tasks automatically
- [ ] Schwab investment rotation reminders piped to `#reminders`
- [ ] Add authentication so only I can access the live URL

---

## Built With

- [Slack API](https://api.slack.com)
- [Cloudflare Workers](https://workers.cloudflare.com)
- [Cloudflare Pages](https://pages.cloudflare.com)
- [Claude API](https://anthropic.com)
- [GitHub](https://github.com)

---

*GhostStack — built by a sysadmin who got tired of writing the same email from scratch every day.*  
*[redacted] · 2026*
