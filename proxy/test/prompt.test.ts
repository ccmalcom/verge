import { describe, expect, it } from 'vitest';
import { enforceCard } from '../src/card/enforce.js';
import { DEEPER_INSTRUCTIONS, PROMPT_VERSION, TIER1_INSTRUCTIONS, deeperUserText, tierOneUserText } from '../src/card/prompt.js';
import { CLASSES, CONFIDENCES, LENSES } from '../src/card/schema.js';
import { validContext, validTierOne } from './fixtures.js';

describe('prompts', () => {
  it('has a versioned id', () => {
    expect(PROMPT_VERSION).toMatch(/^p\d+$/);
  });

  it('names every class, lens and confidence state', () => {
    for (const word of [...CLASSES, ...LENSES, ...CONFIDENCES]) expect(TIER1_INSTRUCTIONS).toContain(word);
  });

  it('forbids numeric confidence and keeps edible finds at likely', () => {
    expect(TIER1_INSTRUCTIONS).toMatch(/never express confidence as a number/i);
    expect(TIER1_INSTRUCTIONS).toMatch(/at most likely/i);
  });

  it('forbids URLs in deeper answers', () => {
    expect(DEEPER_INSTRUCTIONS).toMatch(/never include urls/i);
  });
});

describe('tierOneUserText', () => {
  it('describes a photo capture with context and note', () => {
    const text = tierOneUserText(validContext({ neighborhood: 'Near home' }), 'by the bakery', true);
    expect(text).toContain('Season: autumn');
    expect(text).toContain('A photo is attached.');
    expect(text).toContain('"by the bakery"');
    expect(text).toContain('Near home');
  });

  it('marks a note-only capture', () => {
    expect(tierOneUserText(validContext(), 'hawk on the steeple', false)).toContain('No photo');
  });
});

describe('deeperUserText', () => {
  it('carries the card and the question', () => {
    const { card } = enforceCard(validTierOne());
    const text = deeperUserText(validContext(), card, 'Why does it grow in gravel?', undefined, true);
    expect(text).toContain('Common mullein');
    expect(text).toContain('"Why does it grow in gravel?"');
  });
});
