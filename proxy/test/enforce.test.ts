import { describe, expect, it } from 'vitest';
import { checkCardRules, enforceCard, enforceDeeper, SAFETY_HEADING, SAFETY_LEAD, SAFETY_REST } from '../src/card/enforce.js';
import { validTierOne } from './fixtures.js';

describe('enforceCard', () => {
  it('caps an edible confident find at likely and attaches the safety block', () => {
    const { card, capped } = enforceCard(
      validTierOne({ edible_or_medicinal: true, confidence: 'confident', lookalike_line: 'Moonseed looks similar and is poisonous.' }),
    );
    expect(capped).toBe(true);
    expect(card.confidence).toBe('likely');
    expect(card.tier2_label).toBe('What would settle it');
    expect(card.safety).toEqual({
      heading: SAFETY_HEADING,
      lead: SAFETY_LEAD,
      rest: SAFETY_REST,
      lookalike_line: 'Moonseed looks similar and is poisonous.',
    });
  });

  it('attaches the safety block to an edible find even when not capped', () => {
    const { card, capped } = enforceCard(validTierOne({ edible_or_medicinal: true, confidence: 'unsure' }));
    expect(capped).toBe(false);
    expect(card.safety?.lead).toBe(SAFETY_LEAD);
  });

  it('has no safety block and drops a stray lookalike line on a non-edible find', () => {
    const { card } = enforceCard(validTierOne({ lookalike_line: 'stray' }));
    expect(card.safety).toBeNull();
    expect(card.lookalike_line).toBeNull();
  });

  it.each([
    ['confident', 'What to look for'],
    ['likely', 'What would settle it'],
    ['unsure', 'How to tell them apart'],
  ] as const)('derives the %s label', (confidence, label) => {
    expect(enforceCard(validTierOne({ confidence })).card.tier2_label).toBe(label);
  });

  it('keeps help_asks only for cant_tell', () => {
    const asks = ['A shot from above', 'A note on size'];
    expect(enforceCard(validTierOne({ confidence: 'cant_tell', help_asks: asks })).card.help_asks).toEqual(asks);
    expect(enforceCard(validTierOne({ confidence: 'likely', help_asks: asks })).card.help_asks).toBeNull();
  });

  it('trims follow_ups to three', () => {
    const { card } = enforceCard(validTierOne({ follow_ups: ['a', 'b', 'c', 'd', 'e'] }));
    expect(card.follow_ups).toEqual(['a', 'b', 'c']);
  });
});

describe('checkCardRules', () => {
  it('requires exactly two help_asks for cant_tell', () => {
    expect(checkCardRules(validTierOne({ confidence: 'cant_tell', help_asks: null }))).toMatch(/help_asks/);
    expect(checkCardRules(validTierOne({ confidence: 'cant_tell', help_asks: ['one'] }))).toMatch(/help_asks/);
    expect(checkCardRules(validTierOne({ confidence: 'cant_tell', help_asks: ['one', 'two'] }))).toBeNull();
  });

  it('passes a normal card', () => {
    expect(checkCardRules(validTierOne())).toBeNull();
  });
});

describe('enforceDeeper', () => {
  it('trims follow_ups to three', () => {
    expect(enforceDeeper({ answer: 'x', follow_ups: ['a', 'b', 'c', 'd'] }).follow_ups).toEqual(['a', 'b', 'c']);
  });
});
