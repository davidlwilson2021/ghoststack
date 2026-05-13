// Per-user task storage backed by D1.
//
// Phase 2 moves tasks from Slack-as-source-of-truth to D1. Every row is
// scoped by user_id so a user can never see or modify another user's
// tasks (admin Monitor views are routed elsewhere). The legacy /log
// Slack proxy still exists for backward compatibility with the EOD
// generator's current Slack-reading path; the frontend dual-writes
// during the transition.

import { json, err } from '../lib/cors.js';
import { getSession } from '../lib/session.js';

const MAX_TASK_TEXT = 5000;
const MAX_CATEGORY = 50;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+\-]\d{2}:?\d{2})?)?$/;

export async function createTask(request, env) {
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

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : 'general';

  if (!text) return err('text is required', 400, request);
  if (text.length > MAX_TASK_TEXT) return err(`text too long (max ${MAX_TASK_TEXT})`, 400, request);
  if (!category || category.length > MAX_CATEGORY) return err('Invalid category', 400, request);

  const row = await env.DB.prepare(
    `INSERT INTO tasks (user_id, category, text)
     VALUES (?, ?, ?)
     RETURNING id, category, text, source, created_at`
  ).bind(session.user_id, category, text).first();

  return json({ ok: true, task: row }, 200, request);
}

export async function listTasks(request, env) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Not authenticated', 401, request);

  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const category = url.searchParams.get('category');
  let limit = parseInt(url.searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10);
  if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  if (fromParam && !ISO_DATETIME_RE.test(fromParam)) return err('Invalid from (expected ISO datetime)', 400, request);
  if (toParam && !ISO_DATETIME_RE.test(toParam)) return err('Invalid to (expected ISO datetime)', 400, request);
  if (category && category.length > MAX_CATEGORY) return err('Invalid category', 400, request);

  const conditions = ['user_id = ?'];
  const params = [session.user_id];
  // Use datetime() on both sides so different ISO formats (with/without T,
  // with/without Z, etc.) compare correctly. D1 stores created_at as
  // "YYYY-MM-DD HH:MM:SS"; clients may send "YYYY-MM-DDTHH:MM:SSZ".
  if (fromParam) {
    conditions.push('datetime(created_at) >= datetime(?)');
    params.push(fromParam);
  }
  if (toParam) {
    conditions.push('datetime(created_at) <= datetime(?)');
    params.push(toParam);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  const sql = `SELECT id, category, text, source, created_at FROM tasks
               WHERE ${conditions.join(' AND ')}
               ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const result = await env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, tasks: result.results }, 200, request);
}

export async function deleteTask(request, env, taskId) {
  const session = await getSession(env.DB, request);
  if (!session) return err('Not authenticated', 401, request);

  if (!Number.isInteger(taskId) || taskId < 1) {
    return err('Invalid task id', 400, request);
  }

  // The WHERE user_id = ? clause is the security boundary — even if a
  // user guesses another user's task id, the delete is a no-op.
  const result = await env.DB.prepare(
    'DELETE FROM tasks WHERE id = ? AND user_id = ?'
  ).bind(taskId, session.user_id).run();

  if (!result.meta || result.meta.changes === 0) {
    return err('Task not found', 404, request);
  }

  return json({ ok: true, message: 'Task deleted' }, 200, request);
}
