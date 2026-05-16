// Phase 1 legacy proxy routes — Slack and Claude calls that use the
// platform-wide secrets. Phase 2 will introduce per-user equivalents
// at /tasks, /eod, etc. These remain for backward compatibility with
// the current frontend until the new endpoints are wired up.

import { corsHeaders, err } from '../lib/cors.js';
import { getSession } from '../lib/session.js';
import { generate } from '../lib/ai/anthropic.js';
import { logAudit } from '../lib/audit.js';

export async function logToSlack(request, env) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Authentication required', 401, request);

  const body = await request.json();
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel: body.channel, text: body.text }),
  });
  return new Response(res.body, { headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
}

export async function fetchHistory(request, env) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Authentication required', 401, request);

  const url = new URL(request.url);
  const channel = url.searchParams.get('channel');
  const limit = url.searchParams.get('limit') || '30';
  const oldest = url.searchParams.get('oldest') || '';
  let apiUrl = `https://slack.com/api/conversations.history?channel=${channel}&limit=${limit}`;
  if (oldest) apiUrl += `&oldest=${oldest}`;
  const res = await fetch(apiUrl, {
    headers: { 'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}` },
  });
  return new Response(res.body, { headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
}

export async function callClaude(request, env) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Authentication required', 401, request);

  const body = await request.json();
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return err('messages must be a non-empty array', 400, request);
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
