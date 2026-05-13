const ALLOWED_ORIGIN = 'https://ghoststack.pages.dev';

function corsHeaders(request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowedOrigin = (origin === ALLOWED_ORIGIN || origin.endsWith('.ghoststack.pages.dev')) ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function json(data, status = 200, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

function err(message, status = 400, request = null) {
  return json({ ok: false, error: message }, status, request);
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function getSession(db, request) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const row = await db.prepare(
    `SELECT s.*, u.email, u.display_name, u.role, u.status
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();
  if (!row || row.status !== 'approved') return null;
  return row;
}

async function seedAdmin(db, env) {
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(env.ADMIN_EMAIL).first();
  if (existing) return;
  const salt = env.ADMIN_EMAIL + ':ghoststack';
  const hash = await hashPassword('admin', salt);
  await db.prepare(
    `INSERT INTO users (email, password_hash, display_name, role, status) VALUES (?, ?, ?, 'admin', 'approved')`
  ).bind(env.ADMIN_EMAIL, hash, 'Admin').run();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    await seedAdmin(env.DB, env);

    // --- AUTH ROUTES (no session required) ---

    if (path === '/auth/register' && request.method === 'POST') {
      const { email, password, displayName } = await request.json();
      if (!email || !password || !displayName) return err('Email, password, and display name are required', 400, request);
      if (password.length < 8) return err('Password must be at least 8 characters', 400, request);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Invalid email address', 400, request);
      if (displayName.length > 100) return err('Display name too long', 400, request);

      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
      if (existing) return err('An account with this email already exists', 400, request);

      const salt = email.toLowerCase() + ':ghoststack';
      const hash = await hashPassword(password, salt);
      const safeName = escapeHtml(displayName.trim());
      await env.DB.prepare(
        `INSERT INTO users (email, password_hash, display_name, role, status) VALUES (?, ?, ?, 'user', 'pending')`
      ).bind(email.toLowerCase(), hash, safeName).run();

      return json({ ok: true, message: 'Account request submitted. Awaiting admin approval.' }, 200, request);
    }

    if (path === '/auth/login' && request.method === 'POST') {
      const { email, password } = await request.json();
      if (!email || !password) return err('Email and password are required', 400, request);

      const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first();
      if (!user) return err('Invalid email or password', 401, request);

      const salt = email.toLowerCase() + ':ghoststack';
      const hash = await hashPassword(password, salt);
      if (hash !== user.password_hash) return err('Invalid email or password', 401, request);

      if (user.status === 'pending') return err('Your account is pending admin approval', 403, request);
      if (user.status === 'denied') return err('Your account request has been denied', 403, request);

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await env.DB.prepare(
        'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
      ).bind(token, user.id, expiresAt).run();

      return json({
        ok: true,
        token,
        user: { email: user.email, displayName: user.display_name, role: user.role }
      }, 200, request);
    }

    if (path === '/auth/session' && request.method === 'GET') {
      const session = await getSession(env.DB, request);
      if (!session) return err('Not authenticated', 401, request);
      return json({
        ok: true,
        user: { email: session.email, displayName: session.display_name, role: session.role }
      }, 200, request);
    }

    if (path === '/auth/logout' && request.method === 'POST') {
      const auth = request.headers.get('Authorization');
      if (auth && auth.startsWith('Bearer ')) {
        await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(auth.slice(7)).run();
      }
      return json({ ok: true }, 200, request);
    }

    if (path === '/auth/change-password' && request.method === 'POST') {
      const session = await getSession(env.DB, request);
      if (!session) return err('Not authenticated', 401, request);
      const { currentPassword, newPassword } = await request.json();
      if (!currentPassword || !newPassword) return err('Current and new passwords are required', 400, request);
      if (newPassword.length < 8) return err('New password must be at least 8 characters', 400, request);

      const salt = session.email + ':ghoststack';
      const currentHash = await hashPassword(currentPassword, salt);
      const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(session.user_id).first();
      if (currentHash !== user.password_hash) return err('Current password is incorrect', 400, request);

      const newHash = await hashPassword(newPassword, salt);
      await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind(newHash, session.user_id).run();
      return json({ ok: true, message: 'Password updated' }, 200, request);
    }

    // --- ADMIN ROUTES ---

    if (path === '/admin/users' && request.method === 'GET') {
      const session = await getSession(env.DB, request);
      if (!session || session.role !== 'admin') return err('Admin access required', 403, request);
      const statusFilter = url.searchParams.get('status') || 'all';
      let query = 'SELECT id, email, display_name, role, status, created_at FROM users ORDER BY created_at DESC';
      if (statusFilter !== 'all') {
        query = 'SELECT id, email, display_name, role, status, created_at FROM users WHERE status = ? ORDER BY created_at DESC';
        const rows = await env.DB.prepare(query).bind(statusFilter).all();
        return json({ ok: true, users: rows.results }, 200, request);
      }
      const rows = await env.DB.prepare(query).all();
      return json({ ok: true, users: rows.results }, 200, request);
    }

    if (path === '/admin/approve' && request.method === 'POST') {
      const session = await getSession(env.DB, request);
      if (!session || session.role !== 'admin') return err('Admin access required', 403, request);
      const { userId } = await request.json();
      await env.DB.prepare("UPDATE users SET status = 'approved', updated_at = datetime('now') WHERE id = ?")
        .bind(userId).run();
      return json({ ok: true, message: 'User approved' }, 200, request);
    }

    if (path === '/admin/deny' && request.method === 'POST') {
      const session = await getSession(env.DB, request);
      if (!session || session.role !== 'admin') return err('Admin access required', 403, request);
      const { userId } = await request.json();
      await env.DB.prepare("UPDATE users SET status = 'denied', updated_at = datetime('now') WHERE id = ?")
        .bind(userId).run();
      return json({ ok: true, message: 'User denied' }, 200, request);
    }

    if (path === '/admin/delete' && request.method === 'POST') {
      const session = await getSession(env.DB, request);
      if (!session || session.role !== 'admin') return err('Admin access required', 403, request);
      const { userId } = await request.json();
      const target = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
      if (target && target.role === 'admin') return err('Cannot delete admin accounts', 400, request);
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
      return json({ ok: true, message: 'User deleted' }, 200, request);
    }

    // --- PROTECTED PROXY ROUTES (require auth) ---

    const session = await getSession(env.DB, request);
    if (!session) return err('Authentication required', 401, request);

    if (path === '/log' && request.method === 'POST') {
      const body = await request.json();
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
        },
        body: JSON.stringify({ channel: body.channel, text: body.text }),
      });
      return new Response(res.body, { headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
    }

    if (path === '/history') {
      const channel = url.searchParams.get('channel');
      const limit = url.searchParams.get('limit') || '30';
      const oldest = url.searchParams.get('oldest') || '';
      let apiUrl = `https://slack.com/api/conversations.history?channel=${channel}&limit=${limit}`;
      if (oldest) apiUrl += `&oldest=${oldest}`;
      const res = await fetch(apiUrl, {
        headers: { 'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}` },
      });
      return new Response(res.body, { headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
    }

    if (path === '/claude' && request.method === 'POST') {
      const body = await request.json();
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          messages: body.messages,
        }),
      });
      return new Response(res.body, { headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
    }

    return err('Not found', 404, request);
  },
};
