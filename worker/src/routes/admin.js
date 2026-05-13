import { json, err } from '../lib/cors.js';
import { getSession } from '../lib/session.js';

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
  await env.DB.prepare("UPDATE users SET status = 'approved', updated_at = datetime('now') WHERE id = ?")
    .bind(userId).run();
  return json({ ok: true, message: 'User approved' }, 200, request);
}

export async function deny(request, env) {
  const session = await getSession(env.DB, request);
  if (!session || session.role !== 'admin') return err('Admin access required', 403, request);

  const { userId } = await request.json();
  await env.DB.prepare("UPDATE users SET status = 'denied', updated_at = datetime('now') WHERE id = ?")
    .bind(userId).run();
  return json({ ok: true, message: 'User denied' }, 200, request);
}

export async function deleteUser(request, env) {
  const session = await getSession(env.DB, request);
  if (!session || session.role !== 'admin') return err('Admin access required', 403, request);

  const { userId } = await request.json();
  const target = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
  if (target && target.role === 'admin') return err('Cannot delete admin accounts', 400, request);
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  return json({ ok: true, message: 'User deleted' }, 200, request);
}
