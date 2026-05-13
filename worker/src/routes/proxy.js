// Phase 1 legacy proxy routes — Slack and Claude calls that use the
// platform-wide secrets. Phase 2 will introduce per-user equivalents
// at /tasks, /eod, etc. These remain for backward compatibility with
// the current frontend until the new endpoints are wired up.

import { corsHeaders, err } from '../lib/cors.js';
import { getSession } from '../lib/session.js';

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
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: body.messages,
    }),
  });
  return new Response(res.body, { headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
}
