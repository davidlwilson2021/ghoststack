-- Reference schema — the full current state of the D1 database after all
-- migrations have been applied. This file is for documentation only.
-- The source of truth is the migrations/ directory; do NOT apply this
-- file directly to the database.

-- ─────────────────────────────────────────────────────────────────────────
-- users: account records (Phase 1)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,             -- PBKDF2 base64
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'approved', 'denied', 'suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────
-- sessions: active login sessions (Phase 1)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,              -- 256-bit hex
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,                -- ISO datetime
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- tasks: per-user task entries (Phase 2)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,                  -- 'tier2', 'tech', 'cyber', 'training', ...
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'dashboard'
    CHECK(source IN ('dashboard', 'slack', 'api')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_tasks_user_created ON tasks(user_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- user_settings: per-user preferences and encrypted credentials (Phase 2)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE user_settings (
  user_id INTEGER PRIMARY KEY,
  ai_provider TEXT NOT NULL DEFAULT 'anthropic',  -- 'anthropic' | 'openai'
  ai_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  ai_key_encrypted TEXT,                   -- AES-GCM ciphertext, base64
  ai_key_iv TEXT,                          -- AES-GCM IV, base64
  slack_bot_token_encrypted TEXT,
  slack_bot_token_iv TEXT,
  slack_log_channel TEXT,
  slack_dispatch_channel TEXT,
  email_template TEXT,                     -- JSON {subject, body_intro, body_signature}
  default_recipients TEXT,                 -- JSON ['user@x.com', 'boss@y.com']
  schedule_enabled INTEGER NOT NULL DEFAULT 0,
  schedule_time TEXT,                      -- 'HH:MM'
  schedule_timezone TEXT,                  -- 'America/Phoenix'
  setup_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- audit_log: security event tracking (Phase 2)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,                         -- nullable for pre-auth events
  action TEXT NOT NULL,                    -- 'login.success', 'eod.sent', 'admin.approve', ...
  details TEXT,                            -- JSON, action-specific
  ip TEXT,                                 -- from CF-Connecting-IP
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_audit_user_created ON audit_log(user_id, created_at);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- eod_history: record of every EOD email generated/sent (Phase 2)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE eod_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject TEXT,
  body TEXT,
  recipients TEXT,                         -- JSON
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_eod_user_generated ON eod_history(user_id, generated_at);
