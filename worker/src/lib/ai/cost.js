// Approximate USD pricing per million tokens (May 2026 — Sonnet/Haiku standard tiers).
// Used for audit logging and spike alerts, not invoicing.

const RATES = {
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cache_read: 0.08, cache_write: 1 },
  'claude-sonnet-4-6': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
  'claude-sonnet-4-20250514': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
  'claude-opus-4-6': { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75 },
  'claude-opus-4-7': { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75 },
};

const DEFAULT_RATE = RATES['claude-sonnet-4-6'];

export function estimateCostUsd(model, usage) {
  if (!usage) return 0;
  const rate = RATES[model] || DEFAULT_RATE;
  const perM = (n, price) => ((n || 0) / 1_000_000) * price;
  return (
    perM(usage.input_tokens, rate.input)
    + perM(usage.output_tokens, rate.output)
    + perM(usage.cache_read_input_tokens, rate.cache_read)
    + perM(usage.cache_creation_input_tokens, rate.cache_write)
  );
}

export function usageSummary(usage) {
  if (!usage) return null;
  return {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_tokens: usage.cache_creation_input_tokens ?? 0,
  };
}
