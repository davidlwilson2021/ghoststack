# GhostStack — Quickstart Guide

> A daily operations system for IT staff. Log tasks throughout the day, generate a formatted End-of-Day email with AI, stay organized.

---

## Links

| What | URL |
|---|---|
| Live Dashboard | https://ghoststack.pages.dev |
| GitHub Repo | https://github.com/davidlwilson2021/ghoststack |

---

## Getting Access

GhostStack is invite-only. To use the dashboard:

1. Open the live dashboard URL
2. Click **Request Access** on the sign-in screen
3. Enter your display name, email, and a password (minimum 8 characters)
4. Submit the request — it lands in the admin's queue
5. Wait for admin approval (the admin sees your request in their admin panel)
6. Once approved, sign in with the same credentials

If your request is denied, you'll be told on the sign-in attempt. Contact the admin directly to discuss.

---

## Add to Your Phone Home Screen

**iPhone (Safari):**

1. Open the dashboard URL in Safari
2. Tap the Share button (square with arrow pointing up)
3. Scroll down → **Add to Home Screen**
4. Name it `GhostStack` → Add

**Android (Chrome):**

1. Open the dashboard URL in Chrome
2. Tap the three-dot menu
3. Tap **Add to Home Screen**

Now it opens like a native app — no browser bar, straight to the dashboard.

---

## Daily Workflow

### Morning

1. Open GhostStack
2. The dashboard opens on the **LOG TASK** tab by default
3. Log your first task of the day, even something small

That's your day-start anchor — work has begun.

### Throughout the Day

Drop a task every time you complete something meaningful:

```
- Imaged a new workstation
- Resolved a help desk ticket
- Attended team sync
- Worked on professional development
```

You don't need to be perfect about it. Even 3–5 bullets across the day gives the AI enough context to build a solid EOD email.

### End of Day

1. Switch to the **GENERATE EOD** tab
2. Press **GENERATE DAILY WORK CALL**
3. The system fetches today's logged tasks, sends them to the AI, and returns a formatted email in seconds
4. Press **COPY** and paste into your email client of choice
5. Or post the draft directly to a Slack channel for archive

The whole end-of-day takes under 30 seconds.

---

## Task Categories

The dashboard provides four objective-based categories. Pick the one that fits each task — the AI uses this grouping to organize the EOD email into sections.

| Category | Use For |
|---|---|
| **Tier 2 Sys Admin** | Imaging, AV checks, help desk, device setup, end-user support |
| **Tech Requirements** | Infrastructure, procurement, network items, system integrations |
| **Cyber Governance** | Certificate management, policy compliance, security reviews |
| **Training** | Coursework, certifications, professional development |

---

## Logging Tips

### Write tasks like work notes, not essays

Keep entries short and specific. The AI will clean up phrasing and group items for the email.

```
Good: "Imaged new workstation, installed standard software baseline"
Good: "Resolved network connectivity ticket for end user"
Good: "Submitted weekly assignment for course"

Too vague: "Did computer stuff"
Too long:  "I spent the morning working on the imaging process for the
            workstation and had to troubleshoot an issue with the
            middleware installation which took about two hours to resolve"
```

### Don't stress about logging everything

If you forget to log something during the day, you can edit the generated draft before sending. The AI is a starting point, not a locked document.

---

## Fetch Log Tab

The **FETCH LOG** tab pulls recent messages from the configured Slack channel. Use it to:

- Review what you've logged before generating EOD
- Verify a task posted successfully
- See what you logged yesterday

---

## Changing Your Password

1. After signing in, click your name/avatar in the top right
2. Select **Change Password** from the dropdown menu
3. Enter your current password and a new one (minimum 8 characters)
4. Press **UPDATE**

You'll need to be signed in to change your password. If you've forgotten it, contact the admin.

---

## Troubleshooting

### Dashboard won't load

- Check your internet connection
- Try a different browser or clear cache
- Confirm the dashboard URL is correct

### Sign in fails with "Invalid email or password"

- Double-check the email matches what you registered with (case-insensitive)
- If you recently registered, your request may still be pending admin approval
- If you were previously approved but were revoked, contact the admin

### "Your account is pending admin approval"

- The admin hasn't approved your request yet
- Contact them directly if it's been a while

### Task won't post

- Confirm you're still signed in (refresh the page if needed)
- The bot that posts to Slack must be a member of the target channel — if there's a misconfiguration, contact the admin

### Network error on Generate EOD

- The Cloudflare Worker may be having a brief issue — wait 30 seconds and retry
- If the issue persists, contact the admin to check the Worker status

### Generated draft looks off

- Copy it anyway and edit manually before sending
- The more specific your task logs, the better the AI's output
- If you logged very little, the AI may produce a sparse draft

### Forgot to generate EOD yesterday

- The generator pulls today's tasks only (timestamp-filtered)
- For yesterday, manually compile from the Fetch Log tab

---

## Quick Reference

```
OPEN GHOSTSTACK        ->  ghoststack.pages.dev
LOG A TASK             ->  Pick category, type, press POST (or Enter)
GENERATE EOD           ->  GENERATE EOD tab, press GENERATE
COPY TO CLIPBOARD      ->  Press COPY on the draft
POST DRAFT TO SLACK    ->  Press the post button on the draft
CHANGE YOUR PASSWORD   ->  User menu (top right), Change Password
SIGN OUT               ->  User menu (top right), Sign Out
```

---

## Admin Notes

If you have admin role, you'll see an **ADMIN** tab in the dashboard. From there you can:

- See all users filtered by status (pending, approved, denied, all)
- Approve or deny pending account requests
- Revoke or delete existing users
- See pending request count in the tab badge

For full architecture, security model, and API reference, see [README.md](README.md) and the [docs/](docs/) folder.
