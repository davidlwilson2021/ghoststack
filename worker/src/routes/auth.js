import { json, err } from '../lib/cors.js';
import { hashPassword, generateToken } from '../lib/crypto.js';
import { getSession } from '../lib/session.js';
import { isValidEmail, escapeHtml } from '../lib/validate.js';
import { logAudit } from '../lib/audit.js';

// Resolves the correct PBKDF2 salt for a user row.
//
// New accounts store a cryptographically random salt in password_salt.
// Legacy accounts (created before migration 0005) have password_salt = NULL
// and used the deterministic scheme: email + ':ghoststack'.
// The login path detects the legacy case and upgrades the row on first
// successful login — transparent to the user, no forced password reset.
function legacySalt(email) {
  return email + ':ghoststack';
}

export async function register(request, env) {
  const { email, password, displayName } = await request.json();
  if (!email || !password || !displayName) return err('Email, password, and display name are required', 400, request);
  if (password.length < 8) return err('Password must be at least 8 characters', 400, request);
  if (!isValidEmail(email)) return err('Invalid email address', 400, request);
  if (displayName.length > 100) return err('Display name too long', 400, request);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) return err('An account with this email already exists', 400, request);

  // Always use a fresh random salt for new accounts.
  const salt = generateToken();
  const hash = await hashPassword(password, salt);
  const safeName = escapeHtml(displayName.trim());
  await env.DB.prepare(
    `INSERT INTO users (email, password_hash, password_salt, display_name, role, status) VALUES (?, ?, ?, ?, 'user', 'pending')`
  ).bind(email.toLowerCase(), hash, salt, safeName).run();

  await logAudit(env, request, {
    action: 'auth.register',
    details: { email: email.toLowerCase() },
  });

  return json({ ok: true, message: 'Account request submitted. Awaiting admin approval.' }, 200, request);
}

export async function login(request, env) {
  const { email, password } = await request.json();
  if (!email || !password) return err('Email and password are required', 400, request);

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (!user) {
    await logAudit(env, request, {
      action: 'auth.login.failure',
      details: { email: email.toLowerCase(), reason: 'unknown_user' },
    });
    return err('Invalid email or password', 401, request);
  }

  // Use the stored random salt if present; fall back to legacy deterministic
  // salt for accounts that haven't been upgraded yet.
  const salt = user.password_salt || legacySalt(user.email);
  const hash = await hashPassword(password, salt);
  if (hash !== user.password_hash) {
    await logAudit(env, request, {
      user_id: user.id,
      action: 'auth.login.failure',
      details: { email: user.email, reason: 'bad_password' },
    });
    return err('Invalid email or password', 401, request);
  }

  // Silently upgrade legacy accounts to a random salt on first successful
  // login. The user experiences nothing — their password hasn't changed.
  if (!user.password_salt) {
    const newSalt = generateToken();
    const newHash = await hashPassword(password, newSalt);
    await env.DB.prepare(
      "UPDATE users SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(newHash, newSalt, user.id).run();
  }

  if (user.status !== 'approved') {
    await logAudit(env, request, {
      user_id: user.id,
      action: 'auth.login.failure',
      details: { email: user.email, reason: `status_${user.status}` },
    });
    if (user.status === 'pending') return err('Your account is pending admin approval', 403, request);
    if (user.status === 'denied') return err('Your account request has been denied', 403, request);
    if (user.status === 'suspended') return err('Your account has been suspended', 403, request);
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(token, user.id, expiresAt).run();

  await logAudit(env, request, {
    user_id: user.id,
    action: 'auth.login.success',
    details: { email: user.email, role: user.role },
  });

  return json({
    ok: true,
    token,
    user: { email: user.email, displayName: user.display_name, role: user.role }
  }, 200, request);
}

export async function session(request, env) {
  const sess = await getSession(env.DB, request);
  if (!sess) return err('Not authenticated', 401, request);
  return json({
    ok: true,
    user: { email: sess.email, displayName: sess.display_name, role: sess.role }
  }, 200, request);
}

export async function logout(request, env) {
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    // Resolve user_id before deletion so we can audit who logged out.
    const row = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    if (row) {
      await logAudit(env, request, {
        user_id: row.user_id,
        action: 'auth.logout',
      });
    }
  }
  return json({ ok: true }, 200, request);
}

export async function changePassword(request, env) {
  const sess = await getSession(env.DB, request);
  if (!sess) return err('Not authenticated', 401, request);
  const { currentPassword, newPassword } = await request.json();
  if (!currentPassword || !newPassword) return err('Current and new passwords are required', 400, request);
  if (newPassword.length < 8) return err('New password must be at least 8 characters', 400, request);

  const user = await env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').bind(sess.user_id).first();
  const salt = user?.password_salt || legacySalt(sess.email);
  const currentHash = await hashPassword(currentPassword, salt);
  if (!user || currentHash !== user.password_hash) return err('Current password is incorrect', 400, request);

  // Always write a fresh random salt when the password changes.
  const newSalt = generateToken();
  const newHash = await hashPassword(newPassword, newSalt);
  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newHash, newSalt, sess.user_id).run();

  await logAudit(env, request, {
    user_id: sess.user_id,
    action: 'auth.password_change',
    details: { email: sess.email },
  });

  return json({ ok: true, message: 'Password updated' }, 200, request);
}
