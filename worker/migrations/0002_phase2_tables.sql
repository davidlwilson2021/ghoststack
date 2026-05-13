-- Migration 0002: Phase 2 multi-tenant tables
--
-- Adds per-user task storage, encrypted settings, audit log, and EOD history.
-- All new tables are scoped by user_id for multi-tenant isolation.

-- ─────────────────────────────────────────────────────────────────────────
-- tasks: per-user task entries (D1-backed, no longer reliant on Slack)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'dashboard' CHECK(source IN ('dashboard', 'slack', 'api')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_created ON tasks(user_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- user_settings: per-user preferences and encrypted credentials
--
-- API keys are stored as AES-GCM ciphertext + IV. They are decrypted only
-- inside the Worker at use time, using a MASTER_KEY Cloudflare secret.
-- Never decrypted to the client; never returned in API responses.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY,
  anthropic_key_encrypted TEXT,
  anthropic_key_iv TEXT,
  slack_bot_token_encrypted TEXT,
  slack_bot_token_iv TEXT,
  slack_log_channel TEXT,
  slack_dispatch_channel TEXT,
  email_template TEXT,
  default_recipients TEXT,
  schedule_enabled INTEGER NOT NULL DEFAULT 0,
  schedule_time TEXT,
  schedule_timezone TEXT,
  setup_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- audit_log: security event tracking
--
-- Records sensitive events for monitoring and incident response. The user_id
-- is nullable because some events (e.g. failed login attempts on non-existent
-- accounts) have no associated user.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- eod_history: record of every EOD email generated and (attempted) sent
--
-- Used for the admin Monitor view and for user-facing "past EODs" history.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eod_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject TEXT,
  body TEXT,
  recipients TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_eod_user_generated ON eod_history(user_id, generated_at);
