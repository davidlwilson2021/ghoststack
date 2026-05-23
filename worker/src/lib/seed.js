import { hashPassword } from './crypto.js';

export async function seedAdmin(db, env) {
  // Both ADMIN_EMAIL and ADMIN_PASSWORD must be set as Worker secrets.
  // If either is missing, skip seeding — do not fall back to a hardcoded password.
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(env.ADMIN_EMAIL).first();
  if (existing) return;

  const salt = env.ADMIN_EMAIL + ':ghoststack';
  const hash = await hashPassword(env.ADMIN_PASSWORD, salt);
  await db.prepare(
    `INSERT INTO users (email, password_hash, display_name, role, status) VALUES (?, ?, ?, 'admin', 'approved')`
  ).bind(env.ADMIN_EMAIL, hash, 'Admin').run();
}
