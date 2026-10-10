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

  const located = {
    IFD2: { DateTimeOriginal: '2026:10:10 15:01:44' },
    IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '39/1 44/1 4560/100', GPSLongitudeRef: 'W', GPSLongitude: '86/1 9/1 720/100' },
  };
  const expected = { taken_at: '2026-10-10T15:01:44', approx_location: { lat: 39.746, lng: -86.152 } };

  it('reads the capture date and rounded GPS from a JPEG', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'verge-meta-'));
    const file = path.join(dir, 'located.jpg');
    writeFileSync(file, await sharp({ create: { width: 64, height: 48, channels: 3, background: '#2e5e3e' } }).withExif(located).jpeg().toBuffer());
    expect(await readPhotoMeta(file)).toEqual(expected);
  });

  // exifr 7.1.3 cannot open some HEIF containers itself (iPhone 16 HEICs carry a 52-byte ftyp box,
  // over its 50-byte limit), so EXIF is read from sharp's metadata instead. This fixture is a HEIF
  // container exifr also rejects; sharp cannot write HEVC, so it uses AV1.
  it('reads the capture date and GPS from a HEIF container exifr cannot open directly', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'verge-meta-'));
    const file = path.join(dir, 'located.heif');
    writeFileSync(file, await sharp({ create: { width: 64, height: 48, channels: 3, background: '#2e5e3e' } }).withExif(located).heif({ compression: 'av1' }).toBuffer());
    expect(await exifr.gps(file).catch(() => undefined)).toBeUndefined();
    expect(await readPhotoMeta(file)).toEqual(expected);
  });
});
