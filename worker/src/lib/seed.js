import { hashPassword, generateToken } from './crypto.js';

export async function seedAdmin(db, env) {
  // Both ADMIN_EMAIL and ADMIN_PASSWORD must be set as Worker secrets.
  // If either is missing, skip seeding — do not fall back to a hardcoded password.
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(env.ADMIN_EMAIL).first();
  if (existing) return;

  // Always seed with a random salt — never the legacy deterministic scheme.
  const salt = generateToken();
  const hash = await hashPassword(env.ADMIN_PASSWORD, salt);
  await db.prepare(
    `INSERT INTO users (email, password_hash, password_salt, display_name, role, status) VALUES (?, ?, ?, 'Admin', 'admin', 'approved')`
  ).bind(env.ADMIN_EMAIL, hash, salt).run();
}
