import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, runAsk } from '../src/ask.js';
import { enforceCard } from '../src/card/enforce.js';
import { InvalidOutputError, VendorError } from '../src/generate.js';
import { fakeGenerator } from './fakes.js';
import { validContext, validTierOne } from './fixtures.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
const deps = (script: Array<unknown | Error>) => ({ generate: fakeGenerator(script), vendor: 'anthropic', now: () => 0 });

describe('runAsk: card', () => {
  it('returns an enforced card with meta', async () => {
    const out = await runAsk({ kind: 'card', image: jpeg, context: validContext() }, deps([validTierOne()]));
    expect(out.status).toBe(200);
    if (out.status !== 200 || !('card' in out.body)) throw new Error('expected card');
    expect(out.body.card.tier2_label).toBe('What to look for');
    expect(out.body.meta).toMatchObject({ vendor: 'anthropic', model: 'fake-tier1', prompt_version: 'p1', capped: false });
  });

  it('reports capped when the edible cap fires', async () => {
    const out = await runAsk({ kind: 'card', note: 'purple berries', context: validContext() }, deps([validTierOne({ edible_or_medicinal: true })]));
    if (out.status !== 200 || !('card' in out.body)) throw new Error('expected card');
    expect(out.body.card.confidence).toBe('likely');
    expect(out.body.meta.capped).toBe(true);
  });

  it('rounds location before it reaches the prompt', async () => {
    const d = deps([validTierOne()]);
    await runAsk({ kind: 'card', note: 'x', context: validContext({ approx_location: { lat: 39.756491, lng: -86.146234 } }) }, d);
    expect(d.generate.calls[0].user.text).toContain('39.756, -86.146');
    expect(d.generate.calls[0].user.text).not.toContain('39.7564');
  });

  it('retries once on invalid output, then succeeds', async () => {
    const out = await runAsk({ kind: 'card', note: 'x', context: validContext() }, deps([new InvalidOutputError('bad json'), validTierOne()]));
    expect(out.status).toBe(200);
  });

  it('retries once when card rules fail, then returns 422', async () => {
    const broken = validTierOne({ confidence: 'cant_tell', help_asks: null });
    const out = await runAsk({ kind: 'card', note: 'x', context: validContext() }, deps([broken, broken]));
    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({ error: 'invalid_output' });
  });

  it('vendor error → 502 without retry', async () => {
    const d = deps([new VendorError('429 rate limited')]);
    const out = await runAsk({ kind: 'card', note: 'x', context: validContext() }, d);
    expect(out.status).toBe(502);
    expect(out.body).toMatchObject({ error: 'vendor_error', detail: '429 rate limited' });
    expect(d.generate.calls).toHaveLength(1);
  });

  it('treats an unexpected throw as a vendor error', async () => {
    const out = await runAsk({ kind: 'card', note: 'x', context: validContext() }, deps([new Error('socket hang up')]));
    expect(out.status).toBe(502);
  });

  it('400 when neither image nor note (whitespace note counts as none)', async () => {
    const out = await runAsk({ kind: 'card', note: '   ', context: validContext() }, deps([]));
    expect(out.status).toBe(400);
  });

  it('400 on malformed body', async () => {
    expect((await runAsk({ kind: 'card' }, deps([]))).status).toBe(400);
    expect((await runAsk(null, deps([]))).status).toBe(400);
  });

  it('413 when the image is over the limit', async () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1).toString('base64');
    expect((await runAsk({ kind: 'card', image: big, context: validContext() }, deps([]))).status).toBe(413);
  });
});

describe('runAsk: deeper', () => {
  const { card } = enforceCard(validTierOne());

  it('answers a question with trimmed follow-ups', async () => {
    const d = deps([{ answer: 'Gravel drains fast.', follow_ups: ['a', 'b', 'c', 'd'] }]);
    const out = await runAsk({ kind: 'deeper', note: 'x', context: validContext(), card, question: 'Why gravel?' }, d);
    if (out.status !== 200 || !('deeper' in out.body)) throw new Error('expected deeper');
    expect(out.body.deeper.follow_ups).toEqual(['a', 'b', 'c']);
    expect(d.generate.calls[0].tier).toBe('deeper');
    expect(d.generate.calls[0].user.text).toContain('"Why gravel?"');
  });

  it('400 without a question', async () => {
    expect((await runAsk({ kind: 'deeper', note: 'x', context: validContext(), card }, deps([]))).status).toBe(400);
  });
});
