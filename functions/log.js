// Cloudflare Pages Function — POST /log (Slack mirror).
// Deploys with ghoststack.pages.dev on every git push. Set SLACK_BOT_TOKEN
// and bind D1 (DB) on the Pages project in the Cloudflare dashboard.

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed =
    origin === 'https://ghoststack.pages.dev' || origin.endsWith('.ghoststack.pages.dev')
      ? origin
      : 'https://ghoststack.pages.dev';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

async function getSession(db, request) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const row = await db
    .prepare(
      `SELECT s.user_id, u.status FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .bind(token)
    .first();
  if (!row || row.status !== 'approved') return null;
  return row;
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request) };

  if (!env.DB) {
    return new Response(
      JSON.stringify({ ok: false, error: 'pages_d1_not_bound', source: 'pages-function' }),
      { status: 500, headers }
    );
  }

  const session = await getSession(env.DB, request);
  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: 'Authentication required' }), {
      status: 401,
      headers,
    });
  }

  if (!env.SLACK_BOT_TOKEN) {
    return new Response(
      JSON.stringify({ ok: false, skipped: true, error: 'missing_bot_token', source: 'pages-function' }),
      { headers }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), { status: 400, headers });
  }

  const channel = body?.channel;
  const text = body?.text;
  if (!channel || !text) {
    return new Response(JSON.stringify({ ok: false, error: 'channel and text required' }), {
      status: 400,
      headers,
    });
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, text }),
  });
  const payload = await res.json();

  return new Response(
    JSON.stringify({
      ok: !!payload.ok,
      error: payload.error || null,
      channel,
      source: 'pages-function',
    }),
    { headers }
  );
}
