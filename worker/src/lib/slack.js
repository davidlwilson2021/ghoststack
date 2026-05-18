// Slack helpers — platform bot token posts via chat.postMessage.

const CATEGORY_LABELS = {
  tier2: 'OBJ 1 – TIER 2 SYS ADMIN',
  tech: 'OBJ 2 – TECH REQUIREMENTS',
  cyber: 'OBJ 3 – CYBER SECURITY GOVERNANCE',
  training: 'OBJ 4 – PROFESSIONAL/TRAINING',
  general: 'GENERAL',
};

export function formatTaskMirrorText(category, text) {
  const label = CATEGORY_LABELS[category] || category.toUpperCase();
  return `[${label}] ${text}`;
}

export async function resolveLogChannel(env, userId) {
  const settings = await env.DB.prepare(
    'SELECT slack_log_channel FROM user_settings WHERE user_id = ?'
  ).bind(userId).first();
  return settings?.slack_log_channel || env.SLACK_LOG_CHANNEL || null;
}

export async function postSlackMessage(env, channel, text) {
  if (!env.SLACK_BOT_TOKEN) {
    return { ok: false, skipped: true, error: 'missing_bot_token' };
  }
  if (!channel) {
    return { ok: false, skipped: true, error: 'missing_channel' };
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, text }),
  });
  const payload = await res.json();
  return {
    ok: !!payload.ok,
    error: payload.error || null,
    channel,
  };
}

export async function mirrorTaskToSlack(env, { userId, category, text }) {
  const channel = await resolveLogChannel(env, userId);
  const mirrorText = formatTaskMirrorText(category, text);
  return postSlackMessage(env, channel, mirrorText);
}
