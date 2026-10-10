import { describe, expect, it } from 'vitest';
import { createHandler, type LogEntry } from '../src/handler.js';
import type { CloudVendor } from '../src/card/schema.js';
import { fakeGenerator } from './fakes.js';
import { validContext, validTierOne } from './fixtures.js';

function setup(env: Record<string, string | undefined> = {}) {
  const used: CloudVendor[] = [];
  const logs: LogEntry[] = [];
  const handler = createHandler({
    generatorFor: (v) => {
      used.push(v);
      return fakeGenerator([validTierOne()]);
    },
    env,
    log: (e) => logs.push(e),
  });
  const post = (body: unknown) =>
    handler(new Request('http://local/api/ask', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { handler, used, logs, post };
}

const cardBody = (extra: object = {}) => ({ kind: 'card', note: 'secret note text', context: validContext({ approx_location: { lat: 39.7, lng: -86.1 } }), ...extra });

describe('createHandler', () => {
  it('returns the card as JSON with status 200', async () => {
    const { post } = setup();
    const res = await post(cardBody());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { card: { headline: string } }).card.headline).toBe('Common mullein');
  });

  it('uses CARD_VENDOR as the default vendor', async () => {
    const { post, used } = setup({ CARD_VENDOR: 'google' });
    await post(cardBody());
    expect(used).toEqual(['google']);
  });

  it('ignores a vendor override unless ALLOW_VENDOR_OVERRIDE=1', async () => {
    const off = setup();
    await off.post(cardBody({ vendor: 'openai' }));
    expect(off.used).toEqual(['anthropic']);
    const on = setup({ ALLOW_VENDOR_OVERRIDE: '1' });
    await on.post(cardBody({ vendor: 'openai' }));
    expect(on.used).toEqual(['openai']);
  });

  it('400 on non-JSON, 405 on GET', async () => {
    const { post, handler } = setup();
    expect((await post('not json')).status).toBe(400);
    expect((await handler(new Request('http://local/api/ask'))).status).toBe(405);
  });

  it('logs vendor, status and tokens but never content or location', async () => {
    const { post, logs } = setup();
    await post(cardBody());
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ vendor: 'anthropic', status: 200, input_tokens: 100, output_tokens: 50 });
    const line = JSON.stringify(logs[0]);
    expect(line).not.toContain('secret note text');
    expect(line).not.toContain('39.7');
  });
});
