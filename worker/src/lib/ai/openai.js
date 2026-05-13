// OpenAI Chat Completions adapter.
//
// Translates the unified { apiKey, model, messages } shape into an
// OpenAI /v1/chat/completions request and back to plain text.
// Messages use the same role/content shape as Anthropic's.

const MAX_TOKENS = 2048;

export const DEFAULT_MODEL = 'gpt-4o';

export const MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini (cheaper)' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (fastest)' },
];

export async function generate({ apiKey, model, messages }) {
  if (!apiKey) throw new Error('No OpenAI API key configured');
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages must be a non-empty array');
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data?.error?.message || `OpenAI API error (HTTP ${res.status})`;
    throw new Error(msg);
  }
  const text = data?.choices?.[0]?.message?.content || '';
  return { text, raw: data };
}
