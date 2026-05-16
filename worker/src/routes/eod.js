// Per-user End-of-Day generation.
//
// Pulls today's tasks from D1, decrypts the user's AI API key,
// constructs a prompt from the user's email_template, and dispatches
// to the right AI adapter (Claude / OpenAI). Returns the generated
// draft to the client; sending via email is a separate step.

import { json, err } from '../lib/cors.js';
import { getSession } from '../lib/session.js';
import { decrypt } from '../lib/crypto.js';
import { generate } from '../lib/ai/index.js';
import { sendEmail } from '../lib/email/resend.js';
import { isValidEmail } from '../lib/validate.js';
import { logAudit } from '../lib/audit.js';

const MAX_RECIPIENTS = 20;

// Display labels for the original four G6 category keys used by the
// dashboard. Unknown categories pass through unchanged so users with
// custom category strings see those exact strings in the email.
const DEFAULT_CATEGORY_LABELS = {
  tier2: 'Tier 2 Sys Admin',
  tech: 'Tech Requirements',
  cyber: 'Cyber Security Governance',
  training: 'Professional / Training',
  general: 'General',
};

function categoryLabel(key) {
  return DEFAULT_CATEGORY_LABELS[key] || key;
}

function interpolate(str, vars) {
  if (!str) return '';
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

function buildTaskListBlock(tasks) {
  const byCategory = new Map();
  for (const t of tasks) {
    const key = t.category || 'general';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(t.text);
  }
  const taskListLines = [];
  for (const [key, items] of byCategory) {
    taskListLines.push(`[${categoryLabel(key)}]`);
    for (const text of items) {
      taskListLines.push(`- ${text}`);
    }
    taskListLines.push('');
  }
  return taskListLines.join('\n').trim();
}

function buildEodPrompts({ tasks, displayName, dateStr, template }) {
  const vars = { date: dateStr, name: displayName };
  const subject = interpolate(
    template?.subject || 'Daily Work Summary - {name} - {date}',
    vars
  );
  const bodyIntro = interpolate(
    template?.body_intro || 'Good morning/afternoon,\n\nThis is my daily summary for {date}.',
    vars
  );
  const signature = interpolate(
    template?.body_signature || 'V/R,\n{name}',
    vars
  );
  const taskListBlock = buildTaskListBlock(tasks);

  const system = `You write professional End-of-Day summary emails for IT operations staff.
Be concise: use only the required sections, no preamble or closing notes beyond the signature.
Return ONLY the formatted email starting with "SUBJECT:".

Format the email EXACTLY as follows:

SUBJECT: ${subject}

${bodyIntro}

For each category that has tasks, output a section using this format:

––––––––––––––––––––––––––––
<Category Name>
––––––––––––––––––––––––––––
- <task one>
- <task two>

Use category names exactly as shown in brackets (without brackets). Only include categories with tasks.
Keep task wording professional and faithful — light cleanup only.

End with this signature exactly:

${signature}`;

  const user = `Today's date: ${dateStr}

Tasks logged today (grouped by category):
${taskListBlock}`;

  return { system, user };
}

async function maybeAlertHighCost(env, { estimated_cost_usd, model, user_id, action }) {
  if (!estimated_cost_usd || estimated_cost_usd < 5) return;
  console.warn(`High AI cost: $${estimated_cost_usd.toFixed(2)} model=${model} user=${user_id} action=${action}`);
  const channel = env.COST_ALERT_SLACK_CHANNEL;
  if (!channel || !env.SLACK_BOT_TOKEN) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel,
        text: `:warning: GhostStack AI cost alert: $${estimated_cost_usd.toFixed(2)} (${model}, ${action}, user ${user_id})`,
      }),
    });
  } catch (e) {
    console.warn('cost alert slack failed:', e?.message);
  }
}

export async function generateEod(request, env) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Not authenticated', 401, request);

  const settings = await env.DB.prepare(
    'SELECT * FROM user_settings WHERE user_id = ?'
  ).bind(session.user_id).first();

  if (!settings || !settings.ai_key_encrypted) {
    return err('AI API key not configured. Open Settings to set one.', 400, request);
  }

  // Optional: client can override the "today" window. Defaults to
  // start-of-today in UTC, which matches what the dashboard sends.
  let body = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }
  const fromISO = typeof body?.from === 'string' ? body.from : (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  const tasksResult = await env.DB.prepare(
    `SELECT category, text, created_at FROM tasks
     WHERE user_id = ? AND datetime(created_at) >= datetime(?)
     ORDER BY created_at ASC`
  ).bind(session.user_id, fromISO).all();

  const tasks = tasksResult.results || [];
  if (tasks.length === 0) {
    return err('No tasks logged in the requested range. Log at least one task before generating.', 400, request);
  }

  let apiKey;
  try {
    apiKey = await decrypt(settings.ai_key_encrypted, settings.ai_key_iv, env.MASTER_KEY);
  } catch (_e) {
    return err('Failed to decrypt API key. Re-enter it in Settings.', 500, request);
  }

  const template = settings.email_template ? (() => {
    try { return JSON.parse(settings.email_template); } catch { return null; }
  })() : null;

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const { system, user } = buildEodPrompts({
    tasks,
    displayName: session.display_name,
    dateStr,
    template,
  });

  let result;
  try {
    result = await generate({
      provider: settings.ai_provider || 'anthropic',
      apiKey,
      model: settings.ai_model,
      messages: [{ role: 'user', content: user }],
      system,
      env,
    });
  } catch (e) {
    return err(`AI request failed: ${e.message}`, 502, request);
  }

  const auditDetails = {
    tasks_count: tasks.length,
    provider: settings.ai_provider,
    requested_model: settings.ai_model,
    model: result.model,
    estimated_cost_usd: result.estimated_cost_usd,
    ...(result.usage || {}),
  };

  await logAudit(env, request, {
    user_id: session.user_id,
    action: 'eod.generate',
    details: auditDetails,
  });

  await maybeAlertHighCost(env, {
    estimated_cost_usd: result.estimated_cost_usd,
    model: result.model,
    user_id: session.user_id,
    action: 'eod.generate',
  });

  return json({
    ok: true,
    draft: result.text,
    provider: settings.ai_provider,
    model: result.model,
    tasks_count: tasks.length,
    generated_at: new Date().toISOString(),
  }, 200, request);
}

// Splits a generated draft into { subject, body } by looking for the
// "SUBJECT: ..." marker on its own line. If the marker is missing,
// the caller's draft is used as the body and the subject is empty.
function extractSubject(draft) {
  const match = draft.match(/^\s*SUBJECT:\s*(.+?)\s*$/m);
  if (!match) return { subject: '', body: draft };
  const subject = match[1].trim();
  const body = draft.slice(match.index + match[0].length).replace(/^\s*\n+/, '');
  return { subject, body };
}

export async function sendEod(request, env) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Not authenticated', 401, request);

  if (!env.RESEND_API_KEY) {
    return err('Email delivery is not configured on this server. Set RESEND_API_KEY.', 500, request);
  }
  const fromAddress = env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  let body;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Request body must be a JSON object', 400, request);
  }

  const draft = typeof body.draft === 'string' ? body.draft.trim() : '';
  const recipients = body.recipients;
  if (!draft) return err('draft is required', 400, request);
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return err('recipients must be a non-empty array', 400, request);
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return err(`Too many recipients (max ${MAX_RECIPIENTS})`, 400, request);
  }
  for (const r of recipients) {
    if (!isValidEmail(r)) return err(`Invalid recipient: ${r}`, 400, request);
  }

  // Determine subject + body content from the draft itself (preferred)
  // or from explicit fields supplied by the client.
  const extracted = extractSubject(draft);
  const subject = (typeof body.subject === 'string' && body.subject.trim())
    || extracted.subject
    || `Daily Summary - ${session.display_name}`;
  const emailBody = extracted.body || draft;

  // Record the attempt as pending up front so a Resend failure still
  // leaves a row in eod_history for the admin Monitor view.
  const inserted = await env.DB.prepare(
    `INSERT INTO eod_history (user_id, subject, body, recipients, status)
     VALUES (?, ?, ?, ?, 'pending') RETURNING id`
  ).bind(
    session.user_id,
    subject,
    draft,
    JSON.stringify(recipients)
  ).first();
  const historyId = inserted.id;

  try {
    const result = await sendEmail({
      apiKey: env.RESEND_API_KEY,
      from: fromAddress,
      to: recipients,
      subject,
      text: emailBody,
      replyTo: session.email,
    });
    await env.DB.prepare(
      `UPDATE eod_history SET status='sent', sent_at=datetime('now') WHERE id=?`
    ).bind(historyId).run();
    await logAudit(env, request, {
      user_id: session.user_id,
      action: 'eod.send.success',
      details: {
        history_id: historyId,
        recipients_count: recipients.length,
        subject,
      },
    });
    return json({
      ok: true,
      message: 'EOD sent',
      history_id: historyId,
      message_id: result.id,
      from: fromAddress,
      to: recipients,
      subject,
    }, 200, request);
  } catch (e) {
    await env.DB.prepare(
      `UPDATE eod_history SET status='failed', error_message=? WHERE id=?`
    ).bind(e.message, historyId).run();
    await logAudit(env, request, {
      user_id: session.user_id,
      action: 'eod.send.failure',
      details: {
        history_id: historyId,
        recipients_count: recipients.length,
        error: e.message,
      },
    });
    return err(`Failed to send: ${e.message}`, 502, request);
  }
}
