// Canonical G6 Ops category keys and their display labels.
//
// Single source of truth for all category data — add new categories here,
// not in individual route files. Each context gets its own label format:
//
//   SLACK_CATEGORY_LABELS — all-caps, OBJ-prefixed for quick scanning in channels.
//   EOD_CATEGORY_LABELS   — title-case, no prefix, for email report sections.
//
// G-14: replaces the duplicated CATEGORY_LABELS definitions that previously
// existed in lib/slack.js and routes/eod.js with inconsistent casing.

export const CATEGORY_KEYS = ['tier2', 'tech', 'cyber', 'training', 'general'];

export const SLACK_CATEGORY_LABELS = {
  tier2: 'OBJ 1 – TIER 2 SYS ADMIN',
  tech: 'OBJ 2 – TECH REQUIREMENTS',
  cyber: 'OBJ 3 – CYBER SECURITY GOVERNANCE',
  training: 'OBJ 4 – PROFESSIONAL/TRAINING',
  general: 'GENERAL',
};

export const EOD_CATEGORY_LABELS = {
  tier2: 'Tier 2 Sys Admin',
  tech: 'Tech Requirements',
  cyber: 'Cyber Security Governance',
  training: 'Professional / Training',
  general: 'General',
};