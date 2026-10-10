import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

// 3x2 opaque red RGBA, standing in for a decoded photo.
vi.mock('heic-decode', () => ({
  default: vi.fn(async () => ({ width: 3, height: 2, data: new Uint8ClampedArray(3 * 2 * 4).map((_, i) => (i % 4 === 1 || i % 4 === 2 ? 0 : 255)) })),
}));

const { isHeic, prepareImage } = await import('../../eval/image.js');

// An ftyp box: size, 'ftyp', major brand, minor version, compatible brands. Then padding.
function ftyp(major: string, compatible: string[] = []): Buffer {
  const size = 16 + compatible.length * 4;
  const box = Buffer.alloc(size);
  box.writeUInt32BE(size, 0);
  box.write(`ftyp${major}`, 4, 'ascii');
  compatible.forEach((b, i) => box.write(b, 16 + i * 4, 'ascii'));
  return Buffer.concat([box, Buffer.alloc(16)]);
}
const heicHeader = () => ftyp('heic', ['mif1', 'heic']);

describe('isHeic', () => {
  it('recognises HEIC by its ftyp brands, not its extension', () => {
    expect(isHeic(ftyp('heic', ['mif1', 'heic']))).toBe(true); // iPhone
    expect(isHeic(ftyp('mif1', ['mif1', 'heic', 'hevc']))).toBe(true); // HEVC only in compatible brands
    expect(isHeic(ftyp('heix'))).toBe(true);
    expect(isHeic(ftyp('avif', ['mif1', 'miaf']))).toBe(false); // AVIF stays with sharp
    expect(isHeic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isHeic(Buffer.alloc(4))).toBe(false);
  });
});

describe('prepareImage with HEIC', () => {
  it('decodes HEIC through heic-decode and returns a JPEG', async () => {
    const out = await prepareImage(heicHeader());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([3, 2]);
    const { default: decode } = await import('heic-decode');
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('rejects a fake HEIC with a clear error', async () => {
    const { default: decode } = await import('heic-decode');
    vi.mocked(decode).mockRejectedValueOnce(new Error('input buffer is not a HEIC image'));
    await expect(prepareImage(heicHeader())).rejects.toThrow(/could not decode HEIC/);
  });
});
