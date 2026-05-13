import { hashPassword } from './crypto.js';

export async function seedAdmin(db, env) {
  if (!env.ADMIN_EMAIL) return;
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(env.ADMIN_EMAIL).first();
  if (existing) return;
  const salt = env.ADMIN_EMAIL + ':ghoststack';
  const hash = await hashPassword('admin', salt);
  await db.prepare(
    `INSERT INTO users (email, password_hash, display_name, role, status) VALUES (?, ?, ?, 'admin', 'approved')`
  ).bind(env.ADMIN_EMAIL, hash, 'Admin').run();
}
