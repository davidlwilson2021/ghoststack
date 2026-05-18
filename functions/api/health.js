// GET /api/health — Pages deployment diagnostics (no auth).

export async function onRequestGet({ env }) {
  return new Response(
    JSON.stringify({
      ok: true,
      source: 'pages-function',
      build: 'pages-health-v2',
      hasD1: !!env.DB,
      hasPlatformSlackToken: !!env.SLACK_BOT_TOKEN,
      hasMasterKey: !!env.MASTER_KEY,
      slackLogChannel: env.SLACK_LOG_CHANNEL || null,
      slackReady:
        !!env.SLACK_BOT_TOKEN || (!!env.MASTER_KEY && !!env.DB),
    }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
}
