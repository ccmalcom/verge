import { describe, expect, it } from 'vitest';
import { pickCards, renderExport } from '../../eval/export.js';
import type { ResultRecord, RunResults, Scores } from '../../eval/types.js';
import { enforceCard } from '../../src/card/enforce.js';
import { validTierOne } from '../fixtures.js';

const card = enforceCard(validTierOne()).card;
const meta = { vendor: 'x', model: 'claude-haiku-5-5', prompt_version: 'p1', capped: false, latency_ms: 1, usage: { inputTokens: 1, outputTokens: 1 } };
const rec = (case_id: string, vendor: 'anthropic' | 'openai'): ResultRecord => ({ case_id, vendor, variant: 'without', status: 200, card, meta, error: null, deeper: null, cost_usd: 0 });
const cases = ['a', 'b', 'c'].map((id) => ({ id, file: null, note_file: `${id}.txt`, taken_at: '2026-05-01', approx_location: null, note: `note ${id}`, truth: '', neighborhood: '' }));
const results: RunResults = { run_id: 'r', prompt_version: 'p1', started_at: 'x', vendors: ['anthropic', 'openai'], skipped_vendors: [], cases, records: cases.flatMap((c) => [rec(c.id, 'anthropic'), rec(c.id, 'openai')]) };
const e = (verdict: 'send' | 'edit' | 'bad') => ({ verdict, actually: '', safety_should_fire: false, note: '', location: null });
const scores: Scores = { 'a|openai': e('bad'), 'b|openai': e('send'), 'c|openai': e('send'), 'a|anthropic': e('edit') };

describe('pickCards', () => {
  it('defaults to the vendor with most send-unedited and orders best first', () => {
    const { vendor, records } = pickCards(results, scores, { pick: 2 });
    expect(vendor).toBe('openai');
    expect(records.map((r) => r.case_id)).toEqual(['b', 'c']);
  });

  it('honours explicit ids and vendor', () => {
    const { records } = pickCards(results, scores, { pick: 10, vendor: 'anthropic', ids: ['a'] });
    expect(records.map((r) => `${r.case_id}|${r.vendor}`)).toEqual(['a|anthropic']);
  });
});

describe('renderExport', () => {
  it('produces a standalone page with no vendor names', () => {
    const html = renderExport([{ imageDataUri: null, note: 'note a', html: '<article class="card">Common mullein</article>' }], 'body{}');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Common mullein');
    expect(html).toContain('note a');
    // 'google' is omitted on purpose: the Google Fonts stylesheet URL contains it.
    for (const word of ['anthropic', 'openai', 'claude', 'gpt', 'gemini']) expect(html.toLowerCase()).not.toContain(word);
  });
});
