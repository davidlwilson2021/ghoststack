// GET /api/health — Pages + Worker deployment diagnostics (no auth).

export async function onRequestGet({ env }) {
  let worker = null;
  try {
    const res = await fetch('https://ghoststack-proxy.greyhawkdiesel.workers.dev/health', {
      cf: { cacheTtl: 0 },
    });
    worker = await res.json();
  } catch {
    worker = null;
  }

  const pagesPlatformToken = !!env.SLACK_BOT_TOKEN;
  const pagesMasterKey = !!env.MASTER_KEY;
  const workerHasToken = !!(worker?.hasSlackToken);
  const workerHasMasterKey = !!(worker?.hasMasterKey);

  return new Response(
    JSON.stringify({
      ok: true,
      source: 'pages-function',
      build: 'pages-health-v3',
      pages: {
        hasD1: !!env.DB,
        hasPlatformSlackToken: pagesPlatformToken,
        hasMasterKey: pagesMasterKey,
        slackLogChannel: env.SLACK_LOG_CHANNEL || null,
      },
      worker: worker?.ok
        ? {
            build: worker.build || null,
            hasSlackToken: workerHasToken,
            hasMasterKey: workerHasMasterKey,
            slackLogChannel: worker.slackLogChannel || null,
          }
        : { reachable: false, note: 'Deploy Worker for /health (wrangler deploy)' },
      slackReady:
        pagesPlatformToken ||
        (pagesMasterKey && !!env.DB) ||
        workerHasToken ||
        (workerHasMasterKey && !!env.DB),
    }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
}
