// GET /api/health — Pages deployment diagnostics (no auth).
// Use this to confirm SLACK_BOT_TOKEN and D1 are bound on the Pages project.

export async function onRequestGet({ env }) {
  return new Response(
    JSON.stringify({
      ok: true,
      source: 'pages-function',
      build: 'pages-health-v1',
      hasD1: !!env.DB,
      hasSlackToken: !!env.SLACK_BOT_TOKEN,
      slackLogChannel: env.SLACK_LOG_CHANNEL || null,
    }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
}
