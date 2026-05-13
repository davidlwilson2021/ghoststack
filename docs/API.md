# Worker API Reference

Every API endpoint exposed by the Cloudflare Worker. Base URL is the deployed worker subdomain (configured in `wrangler.toml`).

All requests and responses are JSON. All authenticated requests must include the session token in the `Authorization` header:

```
Authorization: Bearer <token>
```

## Response Format

All endpoints return one of two shapes:

**Success:**
```json
{ "ok": true, ...payload }
```

**Error:**
```json
{ "ok": false, "error": "Human-readable error message" }
```

HTTP status codes are also meaningful:

| Status | Meaning |
|---|---|
| 200 | Success |
| 400 | Bad request (validation error) |
| 401 | Not authenticated |
| 403 | Authenticated but not permitted |
| 404 | Route not found |

## Authentication Endpoints

### POST `/auth/register`

Create a new pending account. Does not grant access — an admin must approve.

**Auth:** None

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "minimum-8-chars",
  "displayName": "Display Name"
}
```

**Validation:**
- Email must match a basic email regex
- Password minimum 8 characters
- Display name maximum 100 characters
- Email must not already exist

**Success response:**
```json
{
  "ok": true,
  "message": "Account request submitted. Awaiting admin approval."
}
```

**Error responses:** 400 for any validation failure, including duplicate email.

---

### POST `/auth/login`

Authenticate with email and password. Returns a session token.

**Auth:** None

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "your-password"
}
```

**Success response:**
```json
{
  "ok": true,
  "token": "<64-char hex string>",
  "user": {
    "email": "user@example.com",
    "displayName": "Display Name",
    "role": "user"
  }
}
```

**Error responses:**
- 401 — invalid email or password (generic for both cases, no enumeration)
- 403 — account exists but is pending or denied

---

### GET `/auth/session`

Validate the current session token. Used on page load to determine whether to show the dashboard.

**Auth:** Bearer token

**Success response:**
```json
{
  "ok": true,
  "user": {
    "email": "user@example.com",
    "displayName": "Display Name",
    "role": "user"
  }
}
```

**Error responses:** 401 if token is missing, invalid, or expired.

---

### POST `/auth/logout`

Invalidate the current session token.

**Auth:** Bearer token (will be deleted on success)

**Request body:** None

**Success response:**
```json
{ "ok": true }
```

Logout is always a 200 — even with no/invalid token, the response is success (idempotent).

---

### POST `/auth/change-password`

Change the password for the currently authenticated user.

**Auth:** Bearer token

**Request body:**
```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password-min-8"
}
```

**Validation:**
- Both fields required
- New password minimum 8 characters
- Current password must match the stored hash

**Success response:**
```json
{ "ok": true, "message": "Password updated" }
```

**Error responses:**
- 400 — current password incorrect, or new password too short
- 401 — not authenticated

## Admin Endpoints

All admin endpoints require an authenticated session **and** `role === 'admin'`. Otherwise they return 403.

### GET `/admin/users`

List users.

**Auth:** Bearer token (admin)

**Query parameters:**
- `status` (optional) — filter by `pending`, `approved`, `denied`, or `all` (default: `all`)

**Success response:**
```json
{
  "ok": true,
  "users": [
    {
      "id": 1,
      "email": "user@example.com",
      "display_name": "Display Name",
      "role": "user",
      "status": "pending",
      "created_at": "2026-05-13T14:23:01Z"
    }
  ]
}
```

Users are returned ordered by `created_at DESC`.

---

### POST `/admin/approve`

Approve a pending user (or re-approve a previously denied user).

**Auth:** Bearer token (admin)

**Request body:**
```json
{ "userId": 42 }
```

**Success response:**
```json
{ "ok": true, "message": "User approved" }
```

---

### POST `/admin/deny`

Deny a user. Used to reject pending requests or revoke an approved user. The user's row is preserved (not deleted) and their sessions become invalid on the next request because of the status check.

**Auth:** Bearer token (admin)

**Request body:**
```json
{ "userId": 42 }
```

**Success response:**
```json
{ "ok": true, "message": "User denied" }
```

---

### POST `/admin/delete`

Permanently delete a user and all their sessions. Admins cannot be deleted via this endpoint.

**Auth:** Bearer token (admin)

**Request body:**
```json
{ "userId": 42 }
```

**Success response:**
```json
{ "ok": true, "message": "User deleted" }
```

**Error response:**
- 400 — attempted to delete an admin account

## Proxy Endpoints

These endpoints proxy requests to external APIs using server-side secrets. They require any valid authenticated session (not admin specifically).

### POST `/log`

Post a message to a Slack channel using the bot token.

**Auth:** Bearer token

**Request body:**
```json
{
  "channel": "C0123456789",
  "text": "Message body to post"
}
```

**Response:** Pass-through of the Slack API response. Slack returns:

```json
{
  "ok": true,
  "channel": "C0123456789",
  "ts": "1747166400.000100",
  "message": { ... }
}
```

or, on Slack-side failure:

```json
{
  "ok": false,
  "error": "channel_not_found"
}
```

Common Slack errors:

| Slack error | Meaning |
|---|---|
| `invalid_auth` | Bot token is invalid or expired |
| `channel_not_found` | Channel ID does not exist |
| `not_in_channel` | Bot has not been invited to the channel |
| `missing_scope` | Bot is missing a required OAuth scope |

---

### GET `/history`

Fetch message history from a Slack channel.

**Auth:** Bearer token

**Query parameters:**
- `channel` (required) — Slack channel ID
- `limit` (optional) — number of messages to return, default 30
- `oldest` (optional) — Unix timestamp; only return messages after this time

**Response:** Pass-through of the Slack `conversations.history` response:

```json
{
  "ok": true,
  "messages": [
    {
      "type": "message",
      "user": "U0123456789",
      "text": "Task text here",
      "ts": "1747166400.000100"
    }
  ],
  "has_more": false
}
```

---

### POST `/claude`

Proxy a request to the Anthropic Claude API using the server-side API key.

**Auth:** Bearer token

**Request body:**
```json
{
  "messages": [
    { "role": "user", "content": "Your prompt here" }
  ]
}
```

The Worker enriches the request with:

- `model: "claude-sonnet-4-20250514"`
- `max_tokens: 2048`
- `anthropic-version: 2023-06-01` header
- `x-api-key: <stored secret>` header

**Response:** Pass-through of the Anthropic API response:

```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "Claude's response text" }
  ],
  "model": "claude-sonnet-4-20250514",
  "stop_reason": "end_turn",
  "usage": { "input_tokens": ..., "output_tokens": ... }
}
```

## CORS Handling

The Worker handles preflight OPTIONS requests for every route. Allowed methods:

```
GET, POST, OPTIONS
```

Allowed headers:

```
Content-Type, Authorization
```

The `Access-Control-Allow-Origin` header is set dynamically based on the request's `Origin` header — it echoes back the request origin only if it matches the production Pages domain or one of its preview subdomains. Any other origin gets the production origin echoed back, which the browser will reject.

`Access-Control-Allow-Credentials: true` is always set.

## Error Handling

Every endpoint includes try/catch implicitly via the Worker runtime. Unhandled errors return Cloudflare's default 500 error page (rare — most failures are caught and returned as 4xx responses with a descriptive body).

For client code, the canonical pattern is:

```js
const res = await fetch(`${PROXY}/some/route`, { headers: authHeaders() });
const data = await res.json();
if (!data.ok) throw new Error(data.error);
// use data here
```
