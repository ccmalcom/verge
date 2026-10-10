import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { hasKey, loadEnvLocal } from '../../eval/env.js';
import { runAsk } from '../../src/ask.js';
import { CLOUD_VENDORS } from '../../src/card/schema.js';
import { aiSdkGenerator } from '../../src/generate.js';

loadEnvLocal();
const image = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 46, g: 94, b: 62 } } }).jpeg().toBuffer();

// Real vendor calls, one per vendor with a key. A synthetic image usually yields
// unsure/cant_tell; the point is a schema-valid, guarded card end to end.
for (const vendor of CLOUD_VENDORS) {
  describe.skipIf(!hasKey(vendor))(`live ${vendor}`, () => {
    it('returns a schema-valid card for a real request', async () => {
      const out = await runAsk(
        { kind: 'card', image: image.toString('base64'), note: 'A green patch on a sidewalk', context: { date: '2026-10-10' } },
        { generate: aiSdkGenerator(vendor), vendor },
      );
      expect(out.status, JSON.stringify(out.body)).toBe(200);
    });
  });
}
