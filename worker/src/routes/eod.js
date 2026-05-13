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

function buildPrompt({ tasks, displayName, dateStr, template }) {
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

  // Group tasks by category, preserving insertion order so the email
  // sections appear in a consistent (logging) order.
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
  const taskListBlock = taskListLines.join('\n').trim();

  return `You are an assistant that writes professional End-of-Day summary emails for IT operations staff. Generate a clear, properly formatted daily summary email from the tasks below.

Today's date: ${dateStr}

Tasks logged today (grouped by category):
${taskListBlock}

Format the email EXACTLY as follows:

SUBJECT: ${subject}

${bodyIntro}

For each category that has tasks, output a section using this format:

––––––––––––––––––––––––––––
<Category Name>
––––––––––––––––––––––––––––
- <task one>
- <task two>

Use the category names exactly as shown in the brackets above (without the brackets). Only include categories that have tasks. Keep task wording professional but faithful to the original entries — clean up spelling and phrasing only.

End the email with this signature, exactly as given:

${signature}

Return ONLY the formatted email starting with "SUBJECT:" and nothing else. Do not include any explanation, preamble, or trailing notes.`;
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

  const prompt = buildPrompt({
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
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    return err(`AI request failed: ${e.message}`, 502, request);
  }

  return json({
    ok: true,
    draft: result.text,
    provider: settings.ai_provider,
    model: settings.ai_model,
    tasks_count: tasks.length,
    generated_at: new Date().toISOString(),
  }, 200, request);
}
