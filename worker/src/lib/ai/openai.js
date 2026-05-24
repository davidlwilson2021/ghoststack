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

// Approximate USD pricing per million tokens (May 2026).
// Used for audit logging and spike alerts, not invoicing.
const OPENAI_RATES = {
  'gpt-4o':           { input: 5,    output: 15  },
  'gpt-4o-mini':      { input: 0.15, output: 0.60 },
  'gpt-4-turbo':      { input: 10,   output: 30  },
  'gpt-3.5-turbo':    { input: 0.50, output: 1.50 },
};
const DEFAULT_OPENAI_RATE = OPENAI_RATES['gpt-4o'];

function estimateOpenAiCost(model, promptTokens, completionTokens) {
  const rate = OPENAI_RATES[model] || DEFAULT_OPENAI_RATE;
  return (
    ((promptTokens     || 0) / 1_000_000) * rate.input  +
    ((completionTokens || 0) / 1_000_000) * rate.output
  );
}

export async function generate({ apiKey, model, messages }) {
  if (!apiKey) throw new Error('No OpenAI API key configured');
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages must be a non-empty array');
  }
  const resolvedModel = model || DEFAULT_MODEL;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolvedModel,
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

  // G-16: Extract real token counts from the response and compute cost.
  // OpenAI calls them prompt_tokens/completion_tokens; normalise to the same
  // input_tokens/output_tokens shape the Anthropic adapter returns so audit
  // logging and cost tracking work uniformly across providers.
  const promptTokens     = data?.usage?.prompt_tokens     || 0;
  const completionTokens = data?.usage?.completion_tokens || 0;
  const usage = {
    input_tokens:  promptTokens,
    output_tokens: completionTokens,
  };
  const estimated_cost_usd = estimateOpenAiCost(resolvedModel, promptTokens, completionTokens);

  return {
    text,
    raw: data,
    model: resolvedModel,
    requested_model: model,
    usage,
    estimated_cost_usd,
  };
}