import { json, err } from '../lib/cors.js';
import { getSession } from '../lib/session.js';
import { logAudit } from '../lib/audit.js';

export async function listUsers(request, env) {
  const session = await getSession(env.DB, request);
  if (!session || session.role !== 'admin') return err('Admin access required', 403, request);

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status') || 'all';
  if (statusFilter !== 'all') {
    const rows = await env.DB.prepare(
      'SELECT id, email, display_name, role, status, created_at FROM users WHERE status = ? ORDER BY created_at DESC'
    ).bind(statusFilter).all();
    return json({ ok: true, users: rows.results }, 200, request);
  }
  const rows = await env.DB.prepare(
    'SELECT id, email, display_name, role, status, created_at FROM users ORDER BY created_at DESC'
  ).all();
  return json({ ok: true, users: rows.results }, 200, request);
}

export async function approve(request, env) {
  const session = await getSession(env.DB, request);
  if (!session || session.role !== 'admin') return err('Admin access required', 403, request);

  const { userId } = await request.json();
  const target = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first();
  if (!target) return err('User not found', 404, request);
  await env.DB.prepare("UPDATE users SET status = 'approved', updated_at = datetime('now') WHERE id = ?")
    .bind(userId).run();
  await logAudit(env, request, {
    user_id: session.user_id,
    action: 'admin.approve',
    details: { target_user_id: userId, target_email: target.email },
  });
  return json({ ok: true, message: 'User approved' }, 200, request);
}

export async function deny(request, env) {
  const session = await getSession(env.DB, request);
  if (!session || session.role !== 'admin') return err('Admin access required', 403, request);

  const { userId } = await request.json();
  const target = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first();
  if (!target) return err('User not found', 404, request);
  await env.DB.prepare("UPDATE users SET status = 'denied', updated_at = datetime('now') WHERE id = ?")
    .bind(userId).run();
  // Kill any active sessions so the deny takes effect immediately.
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  await logAudit(env, request, {
    user_id: session.user_id,
    action: 'admin.deny',
    details: { target_user_id: userId, target_email: target?.email || null },
  });
  return json({ ok: true, message: 'User denied' }, 200, request);
}

export async function suspend(request, env) {
  const session = await getSession(env.DB, request);
  if (!session || session.role !== 'admin') return err('Admin access required', 403, request);

  const { userId } = await request.json();
  const target = await env.DB.prepare('SELECT email, role FROM users WHERE id = ?').bind(userId).first();
  if (!target) return err('User not found', 404, request);
  if (target.role === 'admin') return err('Cannot suspend admin accounts', 400, request);

  await env.DB.prepare("UPDATE users SET status = 'suspended', updated_at = datetime('now') WHERE id = ?")
    .bind(userId).run();
  // Kill all active sessions for the suspended user.
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  await logAudit(env, request, {
    user_id: session.user_id,
    action: 'admin.suspend',
    details: { target_user_id: userId, target_email: target.email },
  });
  return json({ ok: true, message: 'User suspended' }, 200, request);
}

export async function deleteUser(request, env) {
  const session = await getSession(env.DB, request);
  if (!session || session.role !== 'admin') return err('Admin access required', 403, request);

  const { userId } = await request.json();
  const target = await env.DB.prepare('SELECT email, role FROM users WHERE id = ?').bind(userId).first();
  if (target && target.role === 'admin') return err('Cannot delete admin accounts', 400, request);
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  await logAudit(env, request, {
    user_id: session.user_id,
    action: 'admin.delete',
    details: { target_user_id: userId, target_email: target?.email || null },
  });
  return json({ ok: true, message: 'User deleted' }, 200, request);
}

// ─────────────────────────────────────────────────────────────────────
// Monitor views — admin-only oversight of every user's activity.
// Every view writes its own audit_log entry so even admin reads are
// accountable.
// ─────────────────────────────────────────────────────────────────────

const MONITOR_DEFAULT_LIMIT = 100;
const MONITOR_MAX_LIMIT = 500;

function parseLimit(url) {
  let n = parseInt(url.searchParams.get('limit') || `${MONITOR_DEFAULT_LIMIT}`, 10);
  if (Number.isNaN(n) || n < 1) n = MONITOR_DEFAULT_LIMIT;
  if (n > MONITOR_MAX_LIMIT) n = MONITOR_MAX_LIMIT;
  return n;
}

export async function listAuditLog(request, env) {
  const session = await getSession(env.DB, request);
  if (!session || session.role !== 'admin') return err('Admin access required', 403, request);

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const userId = url.searchParams.get('user_id');
  const limit = parseLimit(url);

  const conds = [];
  const params = [];
  if (action) { conds.push('a.action = ?'); params.push(action); }
  if (userId) { conds.push('a.user_id = ?'); params.push(parseInt(userId, 10)); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const result = await env.DB.prepare(
    `SELECT a.id, a.user_id, u.email AS user_email, a.action, a.details, a.ip, a.user_agent, a.created_at
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.id DESC
     LIMIT ?`
  ).bind(...params, limit).all();

  await logAudit(env, request, {
    user_id: session.user_id,
    action: 'admin.view.audit_log',
    details: { filters: { action, user_id: userId }, limit },
  });

  return json({ ok: true, events: result.results }, 200, request);
}

export async function listAllTasks(request, env) {
  const session = await getSession(env.DB, request);
  if (!session || session.role !== 'admin') return err('Admin access required', 403, request);

  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const category = url.searchParams.get('category');
  const limit = parseLimit(url);

  const conds = [];
  const params = [];
  if (userId) { conds.push('t.user_id = ?'); params.push(parseInt(userId, 10)); }
  if (category) { conds.push('t.category = ?'); params.push(category); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const result = await env.DB.prepare(
    `SELECT t.id, t.user_id, u.email AS user_email, u.display_name AS user_name,
            t.category, t.text, t.source, t.created_at
     FROM tasks t
     LEFT JOIN users u ON u.id = t.user_id
     ${where}
     ORDER BY t.id DESC
     LIMIT ?`
  ).bind(...params, limit).all();

  await logAudit(env, request, {
    user_id: session.user_id,
    action: 'admin.view.all_tasks',
    details: { filters: { user_id: userId, category }, limit },
  });

  return json({ ok: true, tasks: result.results }, 200, request);
}

export async function listEodHistory(request, env) {
  const session = await getSession(env.DB, request);
  if (!session || session.role !== 'admin') return err('Admin access required', 403, request);

  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const status = url.searchParams.get('status');
  const limit = parseLimit(url);

  const conds = [];
  const params = [];
  if (userId) { conds.push('h.user_id = ?'); params.push(parseInt(userId, 10)); }
  if (status) { conds.push('h.status = ?'); params.push(status); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const result = await env.DB.prepare(
    `SELECT h.id, h.user_id, u.email AS user_email, u.display_name AS user_name,
            h.subject, h.recipients, h.status, h.error_message, h.generated_at, h.sent_at
     FROM eod_history h
     LEFT JOIN users u ON u.id = h.user_id
     ${where}
     ORDER BY h.id DESC
     LIMIT ?`
  ).bind(...params, limit).all();

  await logAudit(env, request, {
    user_id: session.user_id,
    action: 'admin.view.eod_history',
    details: { filters: { user_id: userId, status }, limit },
  });

  return json({ ok: true, eods: result.results }, 200, request);
}

export async function getUserActivity(request, env) {
  const session = await getSession(env.DB, request);
  if (!session || session.role !== 'admin') return err('Admin access required', 403, request);

  // Per-user activity stats. Three subqueries vs joining on aggregates
  // keeps the SQL straightforward.
  const result = await env.DB.prepare(
    `SELECT
       u.id, u.email, u.display_name, u.role, u.status, u.created_at,
       (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id) AS task_count,
       (SELECT COUNT(*) FROM eod_history h WHERE h.user_id = u.id AND h.status = 'sent') AS eod_sent_count,
       (SELECT MAX(a.created_at) FROM audit_log a WHERE a.user_id = u.id AND a.action = 'auth.login.success') AS last_login,
       (SELECT COUNT(*) FROM audit_log a WHERE a.user_id = u.id AND a.action = 'auth.login.failure') AS login_failures
     FROM users u
     ORDER BY u.id ASC`
  ).all();

  await logAudit(env, request, {
    user_id: session.user_id,
    action: 'admin.view.user_activity',
  });

  return json({ ok: true, users: result.results }, 200, request);
}
