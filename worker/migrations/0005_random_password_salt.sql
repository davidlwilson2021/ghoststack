-- Migration 0005: Per-user random PBKDF2 salt
--
-- Previously the salt was derived deterministically from the email address
-- (email + ':ghoststack'), which allowed precomputed attacks if the hash
-- was ever exposed. This migration adds a per-user random salt column.
--
-- Backward compatibility: existing rows get NULL, which the auth layer
-- treats as "old scheme" and transparently upgrades to a random salt on
-- the user's next successful login — no forced re-login required.

ALTER TABLE users ADD COLUMN password_salt TEXT;
