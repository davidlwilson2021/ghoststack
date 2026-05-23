// Multi-provider AI dispatcher.
//
// A single entry point — generate({ provider, apiKey, model, messages })
// — routes to the right adapter so the rest of the Worker doesn't need
// to know about provider-specific request shapes. Adding a new provider
// is one new file under lib/ai/ plus a single entry in PROVIDERS.

import * as anthropic from './anthropic.js';
import * as openai from './openai.js';

const PROVIDERS = {
  anthropic,
  openai,
};

export const VALID_PROVIDERS = Object.keys(PROVIDERS);

export function getProviderInfo() {
  return [
    { id: 'anthropic', label: 'Anthropic (Claude)', models: anthropic.MODELS, default_model: anthropic.DEFAULT_MODEL },
    { id: 'openai', label: 'OpenAI (ChatGPT)', models: openai.MODELS, default_model: openai.DEFAULT_MODEL },
  ];
}

export function defaultModelFor(provider) {
  return PROVIDERS[provider]?.DEFAULT_MODEL || null;
}

export function isValidProvider(provider) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, provider);
}

export async function generate({ provider, apiKey, model, messages, system, env }) {
  const adapter = PROVIDERS[provider];
  if (!adapter) throw new Error(`Unknown AI provider: ${provider}`);
  return adapter.generate({ apiKey, model, messages, system, env });
}

export { resolveModel, ALLOWED_MODELS } from './anthropic.js';
export { estimateCostUsd, usageSummary } from './cost.js';
