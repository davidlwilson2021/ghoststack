-- Migration 0003: Add 'suspended' to users.status
--
-- SQLite does not allow modifying a CHECK constraint in place. The standard
-- workaround is to recreate the table with the new constraint, copy data
-- over, drop the old table, and rename. Defer foreign keys during the
-- operation so other tables that reference users(id) don't fail.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied', 'suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, email, password_hash, display_name, role, status, created_at, updated_at)
SELECT id, email, password_hash, display_name, role, status, created_at, updated_at FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;
