-- Migration 0004: Multi-provider AI support
--
-- Generalizes the per-user AI credential from Claude-specific to a
-- provider-agnostic field. Adds explicit columns for the chosen
-- provider name and model id so the Worker can dispatch to the right
-- adapter at runtime.

ALTER TABLE user_settings RENAME COLUMN anthropic_key_encrypted TO ai_key_encrypted;
ALTER TABLE user_settings RENAME COLUMN anthropic_key_iv TO ai_key_iv;

ALTER TABLE user_settings ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'anthropic';
ALTER TABLE user_settings ADD COLUMN ai_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';
