// Per-user settings. Stores:
//
//   - Chosen AI provider (anthropic/openai) and model id
//   - Encrypted AI API key for that provider
//   - Optional encrypted Slack bot token + channel IDs
//   - Custom EOD email template
//   - Default email recipients
//   - Auto-schedule preferences
//
// Encrypted columns store AES-GCM ciphertext + IV (see lib/crypto.js).
// The plaintext is decrypted only inside the Worker at use time. The
// frontend never receives the plaintext — GET returns has_ai_key as
// a boolean instead.

import { json, err } from '../lib/cors.js';
import { getSession } from '../lib/session.js';
import { encrypt } from '../lib/crypto.js';
import { isValidEmail } from '../lib/validate.js';
import { isValidProvider, getProviderInfo } from '../lib/ai/index.js';

const SLACK_CHANNEL_RE = /^[A-Z0-9]{1,20}$/;
const SCHEDULE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIMEZONE_RE = /^[A-Za-z_/+\-0-9]{1,80}$/;
const MODEL_RE = /^[A-Za-z0-9._\-]{1,80}$/;
const TEMPLATE_FIELDS = ['subject', 'body_intro', 'body_signature'];
const MAX_TEMPLATE_FIELD = 5000;
const MAX_KEY_LENGTH = 500;
const MAX_RECIPIENTS = 20;

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function sanitizeView(row) {
  return {
    ai_provider: row?.ai_provider || 'anthropic',
    ai_model: row?.ai_model || null,
    has_ai_key: !!(row && row.ai_key_encrypted),
    has_slack_token: !!(row && row.slack_bot_token_encrypted),
    slack_log_channel: row?.slack_log_channel ?? null,
    slack_dispatch_channel: row?.slack_dispatch_channel ?? null,
    email_template: parseJsonField(row?.email_template, null),
    default_recipients: parseJsonField(row?.default_recipients, []),
    schedule_enabled: !!(row && row.schedule_enabled),
    schedule_time: row?.schedule_time ?? null,
    schedule_timezone: row?.schedule_timezone ?? null,
    setup_complete: !!(row && row.setup_complete),
  };
}

export async function getSettings(request, env) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Not authenticated', 401, request);

  const row = await env.DB.prepare(
    'SELECT * FROM user_settings WHERE user_id = ?'
  ).bind(session.user_id).first();

  return json({
    ok: true,
    settings: sanitizeView(row),
    providers: getProviderInfo(),
  }, 200, request);
}

export async function updateSettings(request, env) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Not authenticated', 401, request);

  let body;
  try {
    body = await request.json();
  } catch {
    return err('Invalid JSON body', 400, request);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Request body must be a JSON object', 400, request);
  }

  // Build the SET clause from only the fields the client supplied.
  const sets = [];
  const params = [];

  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  // --- AI provider and model ---
  if (has('ai_provider')) {
    const p = body.ai_provider;
    if (typeof p !== 'string' || !isValidProvider(p)) {
      return err('Invalid ai_provider', 400, request);
    }
    sets.push('ai_provider = ?');
    params.push(p);
  }

  if (has('ai_model')) {
    const m = body.ai_model;
    if (typeof m !== 'string' || !MODEL_RE.test(m)) {
      return err('Invalid ai_model', 400, request);
    }
    sets.push('ai_model = ?');
    params.push(m);
  }

  // --- encrypted credential fields ---
  if (has('ai_key')) {
    const k = body.ai_key;
    if (k === null || k === '') {
      sets.push('ai_key_encrypted = NULL', 'ai_key_iv = NULL');
    } else {
      if (typeof k !== 'string' || k.length > MAX_KEY_LENGTH) {
        return err('Invalid ai_key', 400, request);
      }
      const { ciphertext, iv } = await encrypt(k, env.MASTER_KEY);
      sets.push('ai_key_encrypted = ?', 'ai_key_iv = ?');
      params.push(ciphertext, iv);
    }
  }

  if (has('slack_bot_token')) {
    const t = body.slack_bot_token;
    if (t === null || t === '') {
      sets.push('slack_bot_token_encrypted = NULL', 'slack_bot_token_iv = NULL');
    } else {
      if (typeof t !== 'string' || t.length > MAX_KEY_LENGTH) {
        return err('Invalid slack_bot_token', 400, request);
      }
      const { ciphertext, iv } = await encrypt(t, env.MASTER_KEY);
      sets.push('slack_bot_token_encrypted = ?', 'slack_bot_token_iv = ?');
      params.push(ciphertext, iv);
    }
  }

  // --- plain text fields ---
  if (has('slack_log_channel')) {
    const c = body.slack_log_channel;
    if (c === null || c === '') {
      sets.push('slack_log_channel = NULL');
    } else if (typeof c !== 'string' || !SLACK_CHANNEL_RE.test(c)) {
      return err('Invalid slack_log_channel (must be C... ID)', 400, request);
    } else {
      sets.push('slack_log_channel = ?');
      params.push(c);
    }
  }

  if (has('slack_dispatch_channel')) {
    const c = body.slack_dispatch_channel;
    if (c === null || c === '') {
      sets.push('slack_dispatch_channel = NULL');
    } else if (typeof c !== 'string' || !SLACK_CHANNEL_RE.test(c)) {
      return err('Invalid slack_dispatch_channel (must be C... ID)', 400, request);
    } else {
      sets.push('slack_dispatch_channel = ?');
      params.push(c);
    }
  }

  if (has('email_template')) {
    const tpl = body.email_template;
    if (tpl === null) {
      sets.push('email_template = NULL');
    } else if (typeof tpl !== 'object' || Array.isArray(tpl)) {
      return err('email_template must be an object', 400, request);
    } else {
      const safe = {};
      for (const k of TEMPLATE_FIELDS) {
        if (typeof tpl[k] === 'string') {
          if (tpl[k].length > MAX_TEMPLATE_FIELD) {
            return err(`email_template.${k} is too long`, 400, request);
          }
          safe[k] = tpl[k];
        }
      }
      sets.push('email_template = ?');
      params.push(JSON.stringify(safe));
    }
  }

  if (has('default_recipients')) {
    const r = body.default_recipients;
    if (r === null) {
      sets.push('default_recipients = NULL');
    } else if (!Array.isArray(r)) {
      return err('default_recipients must be an array', 400, request);
    } else {
      if (r.length > MAX_RECIPIENTS) {
        return err(`Too many recipients (max ${MAX_RECIPIENTS})`, 400, request);
      }
      for (const email of r) {
        if (!isValidEmail(email)) return err(`Invalid email: ${email}`, 400, request);
      }
      sets.push('default_recipients = ?');
      params.push(JSON.stringify(r));
    }
  }

  if (has('schedule_enabled')) {
    sets.push('schedule_enabled = ?');
    params.push(body.schedule_enabled ? 1 : 0);
  }

  if (has('schedule_time')) {
    const t = body.schedule_time;
    if (t === null || t === '') {
      sets.push('schedule_time = NULL');
    } else if (typeof t !== 'string' || !SCHEDULE_TIME_RE.test(t)) {
      return err('schedule_time must be HH:MM', 400, request);
    } else {
      sets.push('schedule_time = ?');
      params.push(t);
    }
  }

  if (has('schedule_timezone')) {
    const tz = body.schedule_timezone;
    if (tz === null || tz === '') {
      sets.push('schedule_timezone = NULL');
    } else if (typeof tz !== 'string' || !TIMEZONE_RE.test(tz)) {
      return err('Invalid schedule_timezone', 400, request);
    } else {
      sets.push('schedule_timezone = ?');
      params.push(tz);
    }
  }

  if (sets.length === 0) {
    return err('No valid fields to update', 400, request);
  }

  // Ensure the row exists before we update.
  await env.DB.prepare(
    'INSERT INTO user_settings (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING'
  ).bind(session.user_id).run();

  sets.push("updated_at = datetime('now')");
  const sql = `UPDATE user_settings SET ${sets.join(', ')} WHERE user_id = ?`;
  params.push(session.user_id);
  await env.DB.prepare(sql).bind(...params).run();

  // Recompute setup_complete: requires an AI key and at least one
  // default recipient. Lets the frontend gate features on this flag.
  const after = await env.DB.prepare(
    'SELECT ai_key_encrypted, default_recipients, setup_complete FROM user_settings WHERE user_id = ?'
  ).bind(session.user_id).first();
  const hasKey = !!after.ai_key_encrypted;
  const recipients = parseJsonField(after.default_recipients, []);
  const complete = hasKey && recipients.length > 0 ? 1 : 0;
  if (after.setup_complete !== complete) {
    await env.DB.prepare(
      'UPDATE user_settings SET setup_complete = ? WHERE user_id = ?'
    ).bind(complete, session.user_id).run();
  }

  const final = await env.DB.prepare(
    'SELECT * FROM user_settings WHERE user_id = ?'
  ).bind(session.user_id).first();

  return json({
    ok: true,
    settings: sanitizeView(final),
    providers: getProviderInfo(),
  }, 200, request);
}

