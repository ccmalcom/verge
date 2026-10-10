import { describe, expect, it } from 'vitest';
import { contextText, roundLocation, seasonFor } from '../src/card/context.js';
import { validContext } from './fixtures.js';

describe('seasonFor', () => {
  it.each([
    ['2026-01-15', 'winter'],
    ['2026-03-01', 'spring'],
    ['2026-05-31', 'spring'],
    ['2026-06-01', 'summer'],
    ['2026-09-01', 'autumn'],
    ['2026-11-30', 'autumn'],
    ['2026-12-01', 'winter'],
    ['2026-10-10T23:30:00-05:00', 'autumn'],
  ])('%s is %s', (date, season) => {
    expect(seasonFor(date)).toBe(season);
  });
});

describe('roundLocation', () => {
  it('rounds to 3 decimals (~100 m)', () => {
    expect(roundLocation({ lat: 39.756491, lng: -86.146234 })).toEqual({ lat: 39.756, lng: -86.146 });
  });

  it('passes through absence', () => {
    expect(roundLocation(undefined)).toBeNull();
    expect(roundLocation(null)).toBeNull();
  });
});

describe('contextText', () => {
  it('states season and no prompt by default', () => {
    const text = contextText(validContext());
    expect(text).toContain('Season: autumn');
    expect(text).toContain('No prompt is active.');
    expect(text).not.toContain('location');
  });

  it('includes prompt, lens, rounded location and neighborhood when given', () => {
    const text = contextText(
      validContext({
        prompt_text: 'Find three plants growing where nobody planted them.',
        lens: 'nature',
        approx_location: { lat: 39.7564, lng: -86.1462 },
        neighborhood: 'Fountain Square',
      }),
    );
    expect(text).toContain('Find three plants growing where nobody planted them.');
    expect(text).toContain('lens: nature');
    expect(text).toContain('39.756, -86.146');
    expect(text).toContain('Fountain Square');
  });
});
