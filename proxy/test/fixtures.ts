import type { AskContext, TierOneOutput } from '../src/card/schema.js';

export function validTierOne(overrides: Partial<TierOneOutput> = {}): TierOneOutput {
  return {
    class: 'plant',
    lens: 'nature',
    confidence: 'confident',
    headline: 'Common mullein',
    summary: 'The felted grey rosette is hard to mistake. It grows in disturbed ground all over the Midwest.',
    tier2_body: 'Feel a leaf: mullein is soft as flannel on both sides.',
    help_asks: null,
    edible_or_medicinal: false,
    lookalike_line: null,
    follow_ups: ['Why does it grow in gravel?', 'What used to use these leaves?'],
    ...overrides,
  };
}

export function validContext(overrides: Partial<AskContext> = {}): AskContext {
  return { date: '2026-10-10', ...overrides };
}
