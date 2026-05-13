// Anthropic Claude adapter.
//
// Translates the unified { apiKey, model, messages } shape into an
// Anthropic /v1/messages request and back to plain text.

const MAX_TOKENS = 2048;

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

export const MODELS = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (most capable)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (balanced)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
];

export async function generate({ apiKey, model, messages }) {
  if (!apiKey) throw new Error('No Anthropic API key configured');
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages must be a non-empty array');
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data?.error?.message || `Anthropic API error (HTTP ${res.status})`;
    throw new Error(msg);
  }
  const text = data?.content?.[0]?.text || '';
  return { text, raw: data };
}
