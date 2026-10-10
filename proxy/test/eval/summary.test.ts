import { describe, expect, it } from 'vitest';
import { formatSummary, passBar, summarize } from '../../eval/summary.js';
import type { ResultRecord, RunResults, Scores } from '../../eval/types.js';
import { enforceCard } from '../../src/card/enforce.js';
import { validTierOne } from '../fixtures.js';

const meta = (latency: number, capped = false) => ({ vendor: 'x', model: 'claude-haiku-5-5', prompt_version: 'p1', capped, latency_ms: latency, usage: { inputTokens: 1, outputTokens: 1 } });
const rec = (case_id: string, vendor: 'anthropic' | 'openai', variant: 'with' | 'without', extra: Partial<ResultRecord> = {}): ResultRecord => ({
  case_id, vendor, variant, status: 200, card: enforceCard(validTierOne()).card, meta: meta(100), error: null, deeper: null, cost_usd: 0.002, ...extra,
});

const results: RunResults = {
  run_id: 'r', prompt_version: 'p1', started_at: 'x', vendors: ['anthropic', 'openai'], skipped_vendors: [],
  cases: [
    { id: 'a', file: 'a.jpg', note_file: null, taken_at: '2026-05-01', approx_location: { lat: 1, lng: 2 }, note: '', truth: '', neighborhood: '' },
    { id: 'b', file: null, note_file: 'b.txt', taken_at: '2026-05-01', approx_location: null, note: 'hawk', truth: '', neighborhood: '' },
    { id: 'c', file: 'c.jpg', note_file: null, taken_at: '2026-05-01', approx_location: null, note: '', truth: '', neighborhood: '' },
  ],
  records: [
    rec('a', 'anthropic', 'with', { meta: meta(300, true) }),
    rec('a', 'anthropic', 'without'),
    rec('b', 'anthropic', 'without', { card: enforceCard(validTierOne({ confidence: 'cant_tell', help_asks: ['x', 'y'] })).card }),
    rec('c', 'anthropic', 'without', { status: 502, card: null, meta: null, error: { error: 'vendor_error', detail: '429' }, cost_usd: null }),
    rec('a', 'openai', 'with'),
    rec('b', 'openai', 'without'),
    rec('c', 'openai', 'without'),
  ],
};

const e = (verdict: 'send' | 'edit' | 'bad' | null, extra = {}) => ({ verdict, actually: '', safety_should_fire: false, note: '', location: null, ...extra });
const scores: Scores = {
  'a|anthropic': e('send', { location: 'helped' }),
  'b|anthropic': e('edit', { actually: 'red-tailed hawk' }),
  'c|anthropic': e('bad', { safety_should_fire: true }),
  'a|openai': e('send'),
  'b|openai': e('send'),
  'c|openai': e('send'),
};

describe('summarize', () => {
  it('computes per-vendor tallies on default variants', () => {
    const [anthropic, openai] = summarize(results, scores);
    expect(anthropic).toMatchObject({
      vendor: 'anthropic', cases: 3, judged: 3, send_unedited: 1, needs_edit: 1, bad: 1,
      safety_misses: 1, capped: 1, cant_tell: 1, errors: 1, location: { helped: 1, same: 0, hurt: 0 },
    });
    expect(anthropic.accuracy).toBeCloseTo(2 / 3);
    expect(anthropic.p50_latency_ms).toBe(100);
    expect(anthropic.mean_cost_usd).toBeCloseTo(0.002);
    expect(openai.send_unedited).toBe(3);
  });

  it('handles a run with no scores', () => {
    const [anthropic] = summarize(results, {});
    expect(anthropic.judged).toBe(0);
    expect(anthropic.accuracy).toBeNull();
  });
});

describe('passBar / formatSummary', () => {
  it('is two thirds of cases, rounded up (20 of 30)', () => {
    expect(passBar(30)).toBe(20);
    expect(passBar(3)).toBe(2);
  });

  it('marks vendors that clear the bar and shows deltas against a compare run', () => {
    const rows = summarize(results, scores);
    const text = formatSummary(rows, summarize(results, {}));
    expect(text).toMatch(/openai.*PASS/);
    expect(text).not.toMatch(/anthropic.*PASS/);
    expect(text).toContain('(+3)');
  });
});
