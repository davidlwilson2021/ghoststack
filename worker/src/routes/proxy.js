// Phase 1 legacy proxy routes — Slack and Claude calls that use the
// platform-wide secrets. Phase 2 will introduce per-user equivalents
// at /tasks, /eod, etc. These remain for backward compatibility with
// the current frontend until the new endpoints are wired up.

import { corsHeaders, err } from '../lib/cors.js';
import { getSession } from '../lib/session.js';
import { postSlackMessage } from '../lib/slack.js';
import { generate } from '../lib/ai/anthropic.js';
import { logAudit } from '../lib/audit.js';

const MAX_SLACK_TEXT = 40000; // Slack hard limit is 40k chars
const MAX_HISTORY_LIMIT = 100;
const MAX_PROXY_INPUT_CHARS = 10_000; // Per-request cap on callClaude to limit platform key spend

// Returns the set of Slack channel IDs the user is allowed to access.
// Pulls from their saved user_settings so they can only reach channels
// they themselves configured — prevents posting/reading arbitrary channels.
async function allowedChannels(db, userId) {
  const row = await db.prepare(
    'SELECT slack_log_channel, slack_dispatch_channel FROM user_settings WHERE user_id = ?'
  ).bind(userId).first();
  const ids = new Set();
  if (row?.slack_log_channel) ids.add(row.slack_log_channel);
  if (row?.slack_dispatch_channel) ids.add(row.slack_dispatch_channel);
  return ids;
}

export async function logToSlack(request, env) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Authentication required', 401, request);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON body', 400, request); }

  const channel = typeof body?.channel === 'string' ? body.channel.trim() : '';
  const text    = typeof body?.text    === 'string' ? body.text.trim()    : '';

  if (!channel) return err('channel is required', 400, request);
  if (!text)    return err('text is required', 400, request);
  if (text.length > MAX_SLACK_TEXT) return err('text too long', 400, request);

  // Guard: only allow posting to channels the user has configured.
  // Fail-closed: a user with no channels configured cannot post to any channel.
  const allowed = await allowedChannels(env.DB, session.user_id);
  if (allowed.size === 0 || !allowed.has(channel)) {
    return err('Channel not in your configured Slack channels', 403, request);
  }

  const slack = await postSlackMessage(env, channel, text);
  return new Response(JSON.stringify(slack), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

export async function fetchHistory(request, env) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Authentication required', 401, request);

  const url = new URL(request.url);
  const channel = url.searchParams.get('channel') || '';
  let limit = parseInt(url.searchParams.get('limit') || '30', 10);
  if (Number.isNaN(limit) || limit < 1) limit = 30;
  if (limit > MAX_HISTORY_LIMIT) limit = MAX_HISTORY_LIMIT;
  // G-12: Validate oldest as a proper Slack timestamp (digits, optional decimal point).
  // Forwarding an arbitrary string to Slack's API is unsafe — it could inject unexpected
  // query params or trigger undefined behavior on Slack's side.
  const oldestRaw = url.searchParams.get('oldest') || '';
  let oldest = '';
  if (oldestRaw) {
    const ts = parseFloat(oldestRaw);
    if (Number.isNaN(ts) || ts <= 0 || !/^\d+(\.\d+)?$/.test(oldestRaw)) {
      return err('oldest must be a valid Slack timestamp (e.g. 1234567890.000000)', 400, request);
    }
    oldest = oldestRaw;
  }

  if (!channel) return err('channel is required', 400, request);

  // Guard: only allow reading channels the user has configured.
  // Fail-closed: a user with no channels configured cannot read any channel.
  const allowed = await allowedChannels(env.DB, session.user_id);
  if (allowed.size === 0 || !allowed.has(channel)) {
    return err('Channel not in your configured Slack channels', 403, request);
  }

  const params = new URLSearchParams({ channel, limit: String(limit) });
  if (oldest) params.set('oldest', oldest);
  const res = await fetch(`https://slack.com/api/conversations.history?${params}`, {
    headers: { 'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}` },
  });
  return new Response(res.body, { headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
}

export async function callClaude(request, env) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Authentication required', 401, request);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON body', 400, request); }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return err('messages must be a non-empty array', 400, request);
  }

  // Guard: prevent any single approved user from exhausting the platform API key.
  const totalChars = body.messages.reduce((sum, m) => {
    return sum + (typeof m?.content === 'string' ? m.content.length : 0);
  }, 0);
  if (totalChars > MAX_PROXY_INPUT_CHARS) {
    return err(`Input too large (${totalChars} chars). Max ${MAX_PROXY_INPUT_CHARS} per request.`, 400, request);
  }

  let result;
  try {
    result = await generate({
      apiKey: env.ANTHROPIC_API_KEY,
      model: body.model,
      messages: body.messages,
      env,
    });
  } catch (e) {
    return err(e.message, 502, request);
  }

  await logAudit(env, request, {
    user_id: session.user_id,
    action: 'proxy.claude',
    details: {
      model: result.model,
      requested_model: body.model,
      estimated_cost_usd: result.estimated_cost_usd,
      ...(result.usage || {}),
    },
  });

  return new Response(JSON.stringify(result.raw), {
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}
