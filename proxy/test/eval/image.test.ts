import exifr from 'exifr';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { prepareImage, readPhotoMeta } from '../../eval/image.js';

async function syntheticJpeg(width: number, height: number, withExif = false): Promise<Buffer> {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 46, g: 94, b: 62 } } });
  if (withExif) img = img.withExif({ IFD0: { Copyright: 'synthetic-secret' } });
  return img.jpeg().toBuffer();
}

describe('prepareImage', () => {
  it('resizes to 1000 px on the long edge', async () => {
    const out = await prepareImage(await syntheticJpeg(3000, 2000));
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1000, 667]);
    expect(meta.format).toBe('jpeg');
  });

  it('never enlarges a small image', async () => {
    const meta = await sharp(await prepareImage(await syntheticJpeg(400, 300))).metadata();
    expect([meta.width, meta.height]).toEqual([400, 300]);
  });

  it('strips EXIF metadata', async () => {
    const input = await syntheticJpeg(800, 600, true);
    expect((await exifr.parse(input))?.Copyright).toBe('synthetic-secret');
    const out = await prepareImage(input);
    expect((await exifr.parse(out))?.Copyright).toBeUndefined();
    expect(await exifr.gps(out)).toBeUndefined();
  });
});

describe('readPhotoMeta', () => {
  it('returns nulls for a photo with no EXIF', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'verge-meta-'));
    const file = path.join(dir, 'plain.jpg');
    writeFileSync(file, await syntheticJpeg(100, 100));
    expect(await readPhotoMeta(file)).toEqual({ taken_at: null, approx_location: null });
  });
});
