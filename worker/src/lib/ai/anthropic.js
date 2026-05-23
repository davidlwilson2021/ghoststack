// Anthropic Claude adapter.
//
// Translates the unified { apiKey, model, messages, system, env } shape into an
// Anthropic /v1/messages request and back to plain text.

import { estimateCostUsd, usageSummary } from './cost.js';

const MAX_TOKENS = 2048;
const MAX_ESTIMATED_INPUT_CHARS = 400_000; // ~100k tokens rough ceiling for EOD

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

export const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
]);

export const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (balanced)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
];

const OPUS_PATTERN = /opus/i;

export function resolveModel(requested, env) {
  if (env?.ALLOW_OPUS === 'true' && requested) {
    return requested;
  }
  if (!requested || OPUS_PATTERN.test(requested) || !ALLOWED_MODELS.has(requested)) {
    if (requested && OPUS_PATTERN.test(requested)) {
      console.warn(`Blocked Opus model "${requested}" — using ${DEFAULT_MODEL}`);
    }
    return DEFAULT_MODEL;
  }
  return requested;
}

function estimateInputChars(messages, system) {
  let n = (system || '').length;
  for (const m of messages || []) {
    n += String(m.content || '').length;
  }
  return n;
}

export async function generate({ apiKey, model, messages, system, env }) {
  if (!apiKey) throw new Error('No Anthropic API key configured');
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages must be a non-empty array');
  }

  const resolvedModel = resolveModel(model, env);
  const inputChars = estimateInputChars(messages, system);
  if (inputChars > MAX_ESTIMATED_INPUT_CHARS) {
    throw new Error(
      `Prompt too large (~${Math.round(inputChars / 4)} est. tokens). Max ~${Math.round(MAX_ESTIMATED_INPUT_CHARS / 4)} for EOD.`
    );
  }

  const body = {
    model: resolvedModel,
    max_tokens: MAX_TOKENS,
    messages,
  };
  if (system) {
    body.system = [
      {
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral' },
      },
    ];
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data?.error?.message || `Anthropic API error (HTTP ${res.status})`;
    throw new Error(msg);
  }
  const text = data?.content?.[0]?.text || '';
  const usage = data?.usage;
  const estimated_cost_usd = estimateCostUsd(resolvedModel, usage);
  return {
    text,
    raw: data,
    model: resolvedModel,
    requested_model: model,
    usage: usageSummary(usage),
    estimated_cost_usd,
  };
}
