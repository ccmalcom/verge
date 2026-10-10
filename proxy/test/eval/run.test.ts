import { serve } from 'srvx';
import { describe, expect, it } from 'vitest';
import { buildCardBody, executeRun, makeBlind, parseRunArgs, planRequests, resolveVendors, type AskFn } from '../../eval/run.js';
import type { ManifestCase } from '../../eval/types.js';
import type { Generator } from '../../src/generate.js';
import { createHandler } from '../../src/handler.js';
import { validTierOne } from '../fixtures.js';

const located: ManifestCase = { id: 'a', file: 'a.jpg', note_file: null, taken_at: '2026-05-01T09:00:00', approx_location: { lat: 39.757, lng: -86.146 }, note: '', truth: '', neighborhood: 'Near home' };
const unlocated: ManifestCase = { id: 'b', file: null, note_file: 'b.txt', taken_at: '2026-05-01T09:00:00', approx_location: null, note: 'hawk on the steeple', truth: '', neighborhood: '' };

describe('parseRunArgs', () => {
  it('defaults to every vendor, both variants, deeper on', () => {
    expect(parseRunArgs([])).toEqual({ vendors: ['anthropic', 'openai', 'google', 'apple-device', 'apple-pcc'], location: 'both', deeper: true, cases: null, concurrency: 4 });
  });

  it('parses flags', () => {
    expect(parseRunArgs(['--vendors', 'anthropic,google', '--location', 'without', '--no-deeper', '--cases', 'a,b', '--concurrency', '2'])).toEqual({
      vendors: ['anthropic', 'google'], location: 'without', deeper: false, cases: ['a', 'b'], concurrency: 2,
    });
  });

  it('rejects unknown vendors and flags', () => {
    expect(() => parseRunArgs(['--vendors', 'mistral'])).toThrow(/unknown vendor/);
    expect(() => parseRunArgs(['--fast'])).toThrow(/unknown argument/);
  });
});

describe('resolveVendors', () => {
  it('skips cloud vendors without keys and Apple without fm', () => {
    const r = resolveVendors(['anthropic', 'openai', 'apple-device'], { hasKey: (v) => v === 'anthropic', fmAvailable: () => false });
    expect(r.active).toEqual(['anthropic']);
    expect(r.skipped.map((s) => s.vendor)).toEqual(['openai', 'apple-device']);
  });
});

describe('planRequests', () => {
  it('skips with-variant when no location', () => {
    const jobs = planRequests([located, unlocated], ['anthropic'], 'both');
    expect(jobs.map((j) => `${j.c.id}:${j.variant}`)).toEqual(['a:with', 'a:without', 'b:without']);
  });

  it('honours with/without modes', () => {
    expect(planRequests([located, unlocated], ['anthropic'], 'with').map((j) => j.c.id)).toEqual(['a']);
    expect(planRequests([located, unlocated], ['anthropic'], 'without')).toHaveLength(2);
  });
});

describe('buildCardBody', () => {
  it('includes location and neighborhood only in the with-variant', () => {
    const img = Buffer.from([1, 2, 3]);
    const withBody = buildCardBody(located, 'with', img, 'openai') as { context: Record<string, unknown>; image: string; vendor: string };
    expect(withBody.context).toMatchObject({ date: '2026-05-01T09:00:00', approx_location: { lat: 39.757, lng: -86.146 }, neighborhood: 'Near home' });
    expect(withBody.image).toBe(img.toString('base64'));
    expect(withBody.vendor).toBe('openai');
    const withoutBody = buildCardBody(located, 'without', img, 'openai') as { context: Record<string, unknown> };
    expect(withoutBody.context).toEqual({ date: '2026-05-01T09:00:00' });
  });
});

describe('makeBlind', () => {
  it('assigns each vendor one label per case', () => {
    const blind = makeBlind([located, unlocated], ['anthropic', 'openai', 'google'], () => 0.3);
    expect(Object.keys(blind)).toEqual(['a', 'b']);
    expect(Object.keys(blind.a)).toEqual(['A', 'B', 'C']);
    expect(Object.values(blind.a).sort()).toEqual(['anthropic', 'google', 'openai']);
  });
});

describe('executeRun', () => {
  const okAsk: AskFn = async (body) =>
    body.kind === 'deeper'
      ? { status: 200, body: { deeper: { answer: 'More.', follow_ups: [] }, meta: { vendor: 'x', model: 'claude-sonnet-5-5', prompt_version: 'p1', capped: false, latency_ms: 5, usage: { inputTokens: 1000, outputTokens: 100 } } } }
      : { status: 200, body: { card: { ...validTierOne(), tier2_label: 'What to look for', safety: null }, meta: { vendor: 'x', model: 'claude-haiku-5-5', prompt_version: 'p1', capped: false, latency_ms: 5, usage: { inputTokens: 1000, outputTokens: 100 } } } };

  it('records cards, deeper answers and cost', async () => {
    const records = await executeRun({ cases: [unlocated], vendors: ['anthropic'], location: 'both', deeper: true, concurrency: 2, askFor: () => okAsk, loadImage: async () => null });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ case_id: 'b', vendor: 'anthropic', variant: 'without', status: 200 });
    expect(records[0].deeper?.question).toBe('Why does it grow in gravel?');
    expect(records[0].cost_usd).toBeGreaterThan(0);
  });

  it('skips deeper when no follow-ups', async () => {
    const noFollow: AskFn = async () => ({ status: 200, body: { card: { ...validTierOne({ follow_ups: [] }), tier2_label: 'x', safety: null }, meta: { vendor: 'x', model: 'claude-haiku-5-5', prompt_version: 'p1', capped: false, latency_ms: 5, usage: { inputTokens: 1, outputTokens: 1 } } } });
    const records = await executeRun({ cases: [unlocated], vendors: ['anthropic'], location: 'both', deeper: true, concurrency: 1, askFor: () => noFollow, loadImage: async () => null });
    expect(records[0].deeper).toBeNull();
  });

  it('records a failed request and keeps going', async () => {
    let n = 0;
    const flaky: AskFn = async (body) => {
      n += 1;
      if (n === 1) throw new Error('ECONNRESET');
      if (n === 2) return { status: 502, body: { error: 'vendor_error', detail: '429 rate limited' } };
      return okAsk(body);
    };
    const records = await executeRun({ cases: [located, unlocated], vendors: ['anthropic'], location: 'without', deeper: false, concurrency: 1, askFor: () => flaky, loadImage: async () => null });
    expect(records.map((r) => r.status)).toEqual([0, 502]);
    expect(records[0].error?.detail).toMatch(/ECONNRESET/);
    expect(records[1].error?.detail).toBe('429 rate limited');
  });

  it('records a photo that fails to load against that case only and keeps going', async () => {
    const asked: string[] = [];
    const ask: AskFn = async (body) => {
      asked.push(String(body.note ?? 'image'));
      return okAsk(body);
    };
    const records = await executeRun({
      cases: [located, unlocated],
      vendors: ['anthropic'],
      location: 'without',
      deeper: false,
      concurrency: 1,
      askFor: () => ask,
      loadImage: async (c) => {
        if (c.id === 'a') throw new Error('Input buffer contains unsupported image format');
        return null;
      },
    });
    expect(records.map((r) => `${r.case_id}:${r.status}`)).toEqual(['a:0', 'b:200']);
    expect(records[0].error).toEqual({ error: 'bad_request', detail: 'image a.jpg: Input buffer contains unsupported image format' });
    expect(asked).toEqual(['hawk on the steeple']);
  });

  it('works end to end over HTTP against the real handler with vendor override', async () => {
    const used: string[] = [];
    // The handler asks generatorFor once per request, so answer by tier rather than by call order.
    const byTier: Generator = async (a) => ({
      output: (a.tier === 'deeper' ? { answer: 'Gravel drains fast.', follow_ups: [] } : validTierOne()) as never,
      model: `fake-${a.tier}`,
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const handler = createHandler({
      generatorFor: (v) => {
        used.push(v);
        return byTier;
      },
      env: { ALLOW_VENDOR_OVERRIDE: '1' },
      log: () => {},
    });
    const server = serve({ fetch: handler, port: 0, hostname: '127.0.0.1', silent: true });
    await server.ready();
    try {
      const askHttp: AskFn = async (body) => {
        const res = await fetch(new URL('api/ask', server.url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        return { status: res.status, body: await res.json() };
      };
      const records = await executeRun({ cases: [unlocated], vendors: ['google'], location: 'both', deeper: true, concurrency: 1, askFor: () => askHttp, loadImage: async () => null });
      expect(records[0].status).toBe(200);
      expect(records[0].card?.headline).toBe('Common mullein');
      expect(records[0].deeper?.answer?.answer).toBe('Gravel drains fast.');
      expect(used).toContain('google');
    } finally {
      await server.close();
    }
  });
});
