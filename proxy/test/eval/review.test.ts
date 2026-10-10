import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createReviewHandler } from '../../eval/review/server.js';
import type { Blind, RunResults } from '../../eval/types.js';
import { enforceCard } from '../../src/card/enforce.js';
import { validTierOne } from '../fixtures.js';

async function fixtureRun() {
  const root = mkdtempSync(path.join(tmpdir(), 'verge-review-'));
  const photosDir = path.join(root, 'photos');
  const runDir = path.join(root, 'runs', 'r1');
  mkdirSync(photosDir, { recursive: true });
  mkdirSync(runDir, { recursive: true });
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toFile(path.join(photosDir, 'a.jpg'));
  const card = enforceCard(validTierOne()).card;
  const meta = { vendor: 'x', model: 'claude-haiku-5-5', prompt_version: 'p1', capped: false, latency_ms: 5, usage: { inputTokens: 1, outputTokens: 1 } };
  const rec = (vendor: 'anthropic' | 'openai', variant: 'with' | 'without') => ({ case_id: 'a', vendor, variant, status: 200, card, meta, error: null, deeper: null, cost_usd: 0.001 });
  const results: RunResults = {
    run_id: 'r1', prompt_version: 'p1', started_at: '2026-10-10T00:00:00Z', vendors: ['anthropic', 'openai'], skipped_vendors: [],
    cases: [{ id: 'a', file: 'a.jpg', note_file: null, taken_at: '2026-05-01T09:00:00', approx_location: { lat: 39.757, lng: -86.146 }, note: '', truth: '', neighborhood: '' }],
    records: [rec('anthropic', 'with'), rec('anthropic', 'without'), rec('openai', 'with'), rec('openai', 'without')],
  };
  const blind: Blind = { a: { A: 'openai', B: 'anthropic' } };
  writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(results));
  writeFileSync(path.join(runDir, 'blind.json'), JSON.stringify(blind));
  return { runDir, photosDir, handler: createReviewHandler({ runDir, photosDir }) };
}

const score = (handler: (r: Request) => Promise<Response>, body: object) =>
  handler(new Request('http://local/api/score', { method: 'POST', body: JSON.stringify(body) }));

describe('review server', () => {
  it('serves the run view without vendor or model names', async () => {
    const { handler } = await fixtureRun();
    const res = await handler(new Request('http://local/api/run'));
    const text = await res.text();
    expect(res.status).toBe(200);
    for (const word of ['anthropic', 'openai', 'claude', 'gpt']) expect(text.toLowerCase()).not.toContain(word);
    const view = JSON.parse(text);
    expect(Object.keys(view.cases[0].cards)).toEqual(['A', 'B']);
    expect(view.cases[0].default_variant).toBe('with');
    expect(view.cases[0].cards.A.other).not.toBeNull();
  });

  it('persists and overwrites scores, mapping labels to vendors', async () => {
    const { handler, runDir } = await fixtureRun();
    expect((await score(handler, { case_id: 'a', label: 'A', verdict: 'send' })).status).toBe(200);
    await score(handler, { case_id: 'a', label: 'A', actually: 'purslane', location: 'helped' });
    await score(handler, { case_id: 'a', label: 'A', verdict: 'edit' });
    const saved = JSON.parse(readFileSync(path.join(runDir, 'scores.json'), 'utf8'));
    expect(Object.keys(saved)).toEqual(['a|openai']);
    expect(saved['a|openai']).toEqual({ verdict: 'edit', actually: 'purslane', safety_should_fire: false, note: '', location: 'helped' });
    await score(handler, { case_id: 'a', label: 'A', verdict: null });
    const view = (await (await handler(new Request('http://local/api/run'))).json()) as { scores: Record<string, { verdict: string | null; actually: string }> };
    expect(view.scores['a|A'].verdict).toBeNull();
    expect(view.scores['a|A'].actually).toBe('purslane');
  });

  it('rejects bad scores', async () => {
    const { handler } = await fixtureRun();
    expect((await score(handler, { case_id: 'a', label: 'A', verdict: 'great' })).status).toBe(400);
    expect((await score(handler, { case_id: 'a', label: 'Z', verdict: 'send' })).status).toBe(404);
  });

  it('serves the prepared photo and the static page', async () => {
    const { handler } = await fixtureRun();
    const photo = await handler(new Request('http://local/photo/a'));
    expect(photo.headers.get('content-type')).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(await photo.arrayBuffer())).metadata();
    expect(meta.width).toBe(1000);
    expect((await handler(new Request('http://local/'))).headers.get('content-type')).toMatch(/text\/html/);
    expect((await handler(new Request('http://local/photo/missing'))).status).toBe(404);
  });
});
