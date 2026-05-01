# 👻 GhostStack — Quick Start Guide

> Your daily ops system. Log tasks, generate EODs, stay organized.

---

## 🔗 Your Links

| What | URL |
|---|---|
| 🌐 Dashboard | https://ghoststack.pages.dev |
| 💬 Slack Workspace | https://example.slack.com |
| ⚡ Cloudflare Worker | https://ghoststack-proxy.greyhawkdiesel.workers.dev |
| 📁 GitHub Repo | https://github.com/davidlwilson2021/ghoststack |

---

## 📱 Add to Your Phone Home Screen

**iPhone (Safari):**
1. Open https://ghoststack.pages.dev in Safari
2. Tap the Share button (box with arrow)
3. Scroll down → **Add to Home Screen**
4. Name it `GhostStack` → Add

**Android (Chrome):**
1. Open https://ghoststack.pages.dev in Chrome
2. Tap the three-dot menu
3. Tap **Add to Home Screen**

Now it opens like an app — no browser bar, straight to the dashboard.

---

## ⚡ Daily Workflow

### Morning — BOD
1. Open GhostStack (phone or browser)
2. You're already on **📡 LOG TASK**
3. Log your first task of the day — even something small like "Checked AV in [redacted]"
4. That's your BOD anchor — the day has started

### Throughout the Day
Drop a task every time you complete something meaningful:

```
✅ Imaged workstation
✅ Ran [redacted] PTI search for user ticket
✅ Checked [redacted] cert status
✅ Attended G6 bi-weekly sync
✅ Worked on [redacted] Week 3 assignment
```

You don't need to be perfect about it. Even 3-4 bullets throughout the day gives Claude enough to build a solid EOD.

### End of Day — EOD
1. Switch to **📋 GENERATE EOD**
2. Hit **⚡ GENERATE DAILY WORK CALL**
3. Claude fetches your tasks, formats the email, done in seconds
4. Hit **📋 COPY** and paste into Outlook
5. Or hit **✓ POST TO #claude-dispatch** to save it in Slack first

That's it. The whole workflow takes maybe 30 seconds at EOD.

---

## 📡 Logging Tasks — Tips

### Pick the Right Category
The category you pick determines which category the task goes under in your EOD email.

| Button | Maps To | Use For |
|---|---|---|
| `TIER 2 SYS ADMIN` | Obj 1 | Imaging, AV checks, help desk, device setup |
| `TECH REQUIREMENTS` | Obj 2 | [redacted], procurement, KVM, infrastructure |
| `CYBER GOVERNANCE` | Obj 3 | PKI certs, SCIF, SIPR, policy compliance |
| `TRAINING` | Obj 4 | [redacted], CBTs, professional dev |

### Write Tasks Like Work Notes, Not Essays
Keep it short and specific. Claude will clean it up.

```
✅ Good: "Imaged workstation, installed CAC software"
✅ Good: "Fitch AV check — projector issue reported to facilities"
✅ Good: "[redacted] Week 3 R assignment submitted"

❌ Too vague: "Did computer stuff"
❌ Too long: "I spent the morning working on the imaging process for the workstation and had to troubleshoot an issue with the CAC middleware installation which took about two hours to resolve"
```

### Don't Stress About Logging Everything
If you forget to log something, you can add it manually to the generated draft before copying to Outlook. The EOD generator is a starting point, not a locked document.

---

## 📥 Fetch Log — What It's For

The **📥 FETCH LOG** tab pulls your last 30 messages from `#daily-work-log` directly from Slack. Use it to:

- Review what you logged before generating EOD
- Verify a task actually posted to Slack
- Check what you did yesterday if you forgot to generate EOD

---

## 💬 Your Slack Channels

**Drop into these throughout the day beyond just the dashboard:**

| Channel | Use It For |
|---|---|
| `#daily-work-log` | Dashboard auto-posts here — you can also type directly in Slack |
| `#claude-dispatch` | Your generated EOD drafts land here |
| `#tier2-tickets` | Running notes on specific tickets and device issues |
| `#cyber-governance` | PKI, SIPR, SCIF items you want to track separately |
| `#g6-meetings` | Paste meeting notes and action items |
| `#dsc-550` | Current course notes, links, study material |
| `#assignments` | Due dates, submission confirmations |
| `#scratch` | Anything you want to save quick — links, ideas, reminders |

---

## 🔧 If Something Breaks

### Dashboard won't load
→ Check https://ghoststack.pages.dev in a different browser or clear cache

### Task won't post (red error toast)
→ Check your internet connection  
→ Make sure GhostBot is still in `#daily-work-log` (Slack → channel → Integrations)

### Network Error on Generate EOD
→ This usually means the Cloudflare Worker is having a moment  
→ Wait 30 seconds and try again  
→ If it keeps failing, go to https://dash.cloudflare.com → Workers & Pages → ghoststack-proxy → check it's active

### EOD comes back with only generic recurring items
→ You didn't log any tasks today — the generator uses yesterday's timestamp cutoff  
→ Log at least one task first, then regenerate

### Generated draft looks off
→ Copy it anyway and edit manually in Outlook — Claude will get it right most days  
→ The more specific your task logs, the better the output

---

## 🛠️ Making Changes

### Updating the Dashboard
All changes go through GitHub → auto-deploys to your live URL.

1. Go to https://github.com/davidlwilson2021/ghoststack
2. Click `index.html` → pencil icon
3. Make your changes
4. Commit with a clear message like `fix: updated EOD prompt`
5. Cloudflare Pages redeploys in ~60 seconds

### Updating the Worker
1. Go to https://dash.cloudflare.com
2. Workers & Pages → `ghoststack-proxy` → Edit Code
3. Make changes → Deploy

---

## 🗺️ What's Coming Next

These are features worth building as GhostStack grows:

- **BOD auto-fill** — morning generator that pre-populates recurring tasks so you start the day with a draft already in `#claude-dispatch`
- **PWA install** — proper app icon, offline support, feels fully native on iPhone
- **[redacted] tracker** — log study sessions and assignment completions directly from the dashboard
- **Token security** — move API keys out of the code and into Cloudflare environment variables

---

## 📋 Quick Reference Card

```
OPEN GHOSTSTACK  →  ghoststack.pages.dev
LOG A TASK       →  Pick category → type task → POST (or Enter)
GENERATE EOD     →  📋 tab → ⚡ GENERATE → copy to Outlook
CHECK YOUR LOG   →  📥 tab → PULL LATEST MESSAGES
SLACK WORKSPACE  →  example.slack.com
EOD DRAFTS       →  #claude-dispatch in Slack
```

---

*Built for the daily grind at G6 — [redacted] · 2026*
