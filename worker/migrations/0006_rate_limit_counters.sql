-- Migration 0006: Rate limit counters table
--
-- Provides a D1-backed sliding window store for the rate limiter
-- in src/lib/ratelimit.js. Used to protect unauthenticated auth
-- endpoints (login, register, change-password) from brute force.
--
-- Rows are keyed by a composite string (e.g. "login:1.2.3.4") and
-- store the start of the current window plus the request count.
-- Stale rows are pruned by the daily cron (scheduled handler in index.js).

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key          TEXT    PRIMARY KEY,
  window_start INTEGER NOT NULL,   -- Unix epoch seconds
  count        INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_rlc_window ON rate_limit_counters(window_start);
