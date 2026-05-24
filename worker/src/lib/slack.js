// Slack helpers — platform bot token posts via chat.postMessage.

import { decrypt } from './crypto.js';
import { SLACK_CATEGORY_LABELS } from './categories.js';

export function formatTaskMirrorText(category, text) {
  const label = SLACK_CATEGORY_LABELS[category] || category.toUpperCase();
  return `[${label}] ${text}`;
}

export async function resolveSlackBotToken(env, userId) {
  if (env.SLACK_BOT_TOKEN) {
    return { token: env.SLACK_BOT_TOKEN, source: 'platform' };
  }
  if (!env.MASTER_KEY || !env.DB || !userId) return null;
  const row = await env.DB.prepare(
    `SELECT slack_bot_token_encrypted, slack_bot_token_iv
     FROM user_settings WHERE user_id = ?`
  ).bind(userId).first();
  if (!row?.slack_bot_token_encrypted || !row?.slack_bot_token_iv) return null;
  try {
    const token = await decrypt(
      row.slack_bot_token_encrypted,
      row.slack_bot_token_iv,
      env.MASTER_KEY
    );
    return { token, source: 'user_settings' };
  } catch {
    return null;
  }
}

export async function resolveLogChannel(env, userId) {
  const settings = await env.DB.prepare(
    'SELECT slack_log_channel FROM user_settings WHERE user_id = ?'
  ).bind(userId).first();
  return settings?.slack_log_channel || env.SLACK_LOG_CHANNEL || null;
}

export async function postSlackMessage(env, channel, text, botToken) {
  const token = botToken || env.SLACK_BOT_TOKEN;
  if (!token) {
    return { ok: false, skipped: true, error: 'missing_bot_token' };
  }
  if (!channel) {
    return { ok: false, skipped: true, error: 'missing_channel' };
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
  const creds = await resolveSlackBotToken(env, userId);
  if (!creds?.token) {
    return { ok: false, skipped: true, error: 'missing_bot_token' };
  }
  const channel = await resolveLogChannel(env, userId);
  const mirrorText = formatTaskMirrorText(category, text);
  const result = await postSlackMessage(env, channel, mirrorText, creds.token);
  return { ...result, tokenSource: creds.source };
}
