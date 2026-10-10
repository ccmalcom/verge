import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { CloudVendor } from './card/schema.js';
import type { Tier } from './generate.js';

export const MODELS: Record<CloudVendor, { tier1: string; deeper: string }> = {
  anthropic: { tier1: 'claude-haiku-5-5', deeper: 'claude-sonnet-5-5' },
  openai: { tier1: 'gpt-6-luna', deeper: 'gpt-6-astra' },
  google: { tier1: 'gemini-3.8-flash', deeper: 'gemini-3.1-pro-preview' },
};

// USD per 1M tokens (input / output), checked 2026-10-10. Prompts here stay far
// below the long-context price tiers. gemini-3.8-flash rises to 1.50 / 7.50 on 2027-01-01.
export const PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-6-astra': { input: 10, output: 50 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
  'apple-on-device': { input: 0, output: 0 },
  'apple-pcc': { input: 0, output: 0 },
};

export const KEY_ENV: Record<CloudVendor, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

export function languageModel(vendor: CloudVendor, tier: Tier): LanguageModel {
  const id = MODELS[vendor][tier];
  switch (vendor) {
    case 'anthropic':
      return anthropic(id);
    case 'openai':
      return openai(id);
    case 'google':
      return google(id);
  }
}

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number | null; outputTokens: number | null },
): number | null {
  const price = PRICES_PER_MTOK[model];
  if (!price) return null;
  if (price.input === 0 && price.output === 0) return 0;
  if (usage.inputTokens === null || usage.outputTokens === null) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}
