import { describe, expect, it } from 'vitest';
import { CLOUD_VENDORS } from '../src/card/schema.js';
import { estimateCostUsd, KEY_ENV, MODELS, PRICES_PER_MTOK } from '../src/providers.js';

describe('providers', () => {
  it('has both tiers and a price for every cloud vendor', () => {
    for (const v of CLOUD_VENDORS) {
      expect(MODELS[v].tier1).toBeTruthy();
      expect(MODELS[v].deeper).toBeTruthy();
      expect(PRICES_PER_MTOK[MODELS[v].tier1]).toBeDefined();
      expect(PRICES_PER_MTOK[MODELS[v].deeper]).toBeDefined();
      expect(KEY_ENV[v]).toMatch(/_API_KEY$/);
    }
  });

  it('estimates cost from usage', () => {
    // claude-haiku-5-5: $0.10 in / $0.50 out per 1M tokens
    expect(estimateCostUsd('claude-haiku-5-5', { inputTokens: 2000, outputTokens: 400 })).toBeCloseTo(0.0004, 10);
  });

  it('returns null when usage or price is unknown, and 0 for free models', () => {
    expect(estimateCostUsd('claude-haiku-5-5', { inputTokens: null, outputTokens: 10 })).toBeNull();
    expect(estimateCostUsd('no-such-model', { inputTokens: 1, outputTokens: 1 })).toBeNull();
    expect(estimateCostUsd('apple-on-device', { inputTokens: null, outputTokens: null })).toBe(0);
  });
});
