import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AskRequest, TIER2_LABELS, TierOneOutput } from '../src/card/schema.js';
import { validContext, validTierOne } from './fixtures.js';

describe('TierOneOutput', () => {
  it('accepts a valid card', () => {
    expect(TierOneOutput.safeParse(validTierOne()).success).toBe(true);
  });

  it('rejects an unknown class', () => {
    expect(TierOneOutput.safeParse({ ...validTierOne(), class: 'mineral' }).success).toBe(false);
  });

  it('rejects a numeric confidence', () => {
    expect(TierOneOutput.safeParse({ ...validTierOne(), confidence: 0.9 }).success).toBe(false);
  });

  it('requires every key (nullable, never optional)', () => {
    const { help_asks: _omit, ...rest } = validTierOne();
    expect(TierOneOutput.safeParse(rest).success).toBe(false);
  });

  it('produces a JSON schema with every key required', () => {
    const js = z.toJSONSchema(TierOneOutput) as { required: string[] };
    expect([...js.required].sort()).toEqual(Object.keys(validTierOne()).sort());
  });
});

describe('TIER2_LABELS', () => {
  it('labels each confidence', () => {
    expect(TIER2_LABELS).toEqual({
      confident: 'What to look for',
      likely: 'What would settle it',
      unsure: 'How to tell them apart',
      cant_tell: 'What would help',
    });
  });
});

describe('AskRequest', () => {
  it('accepts a note-only card request', () => {
    expect(AskRequest.safeParse({ kind: 'card', note: 'hawk on a steeple', context: validContext() }).success).toBe(true);
  });

  it('rejects a date that is not ISO', () => {
    expect(AskRequest.safeParse({ kind: 'card', note: 'x', context: { date: '10/10/2026' } }).success).toBe(false);
  });

  it('rejects an out-of-range latitude', () => {
    const ctx = validContext({ approx_location: { lat: 123, lng: 0 } });
    expect(AskRequest.safeParse({ kind: 'card', note: 'x', context: ctx }).success).toBe(false);
  });

  it('tolerates an unknown vendor string (the handler decides what to honour)', () => {
    expect(AskRequest.safeParse({ kind: 'card', note: 'x', context: validContext(), vendor: 'apple-device' }).success).toBe(true);
  });
});
