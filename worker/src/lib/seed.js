import { hashPassword, generateToken } from './crypto.js';

export async function seedAdmin(db, env) {
  // Both ADMIN_EMAIL and ADMIN_PASSWORD must be set as Worker secrets.
  // If either is missing, skip seeding — do not fall back to a hardcoded password.
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;

  // G-11: Use INSERT OR IGNORE so concurrent cold-starts across separate Worker
  // isolates are safe — the second insert is a no-op rather than a duplicate or
  // error. The module-scope adminSeeded flag in index.js avoids redundant DB
  // calls within a single isolate's lifetime; this guard handles the cross-isolate
  // race at the DB level.
  const salt = generateToken();
  const hash = await hashPassword(env.ADMIN_PASSWORD, salt);
  await db.prepare(
    `INSERT OR IGNORE INTO users (email, password_hash, password_salt, display_name, role, status) VALUES (?, ?, ?, 'Admin', 'admin', 'approved')`
  ).bind(env.ADMIN_EMAIL, hash, salt).run();
}