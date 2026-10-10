import exifr from 'exifr';
import decodeHeic from 'heic-decode';
import { readFile } from 'node:fs/promises';
import sharp, { type Sharp } from 'sharp';
import { roundLocation } from '../src/card/context.js';
import type { LatLng } from './types.js';

// ISO-BMFF brands that mean HEVC-coded HEIF. Checked across the major brand and every compatible
// brand in the ftyp box: iPhone writes major 'heic', but other HEIC writers use major 'mif1' with
// 'heic' only in the compatible list (seen in a real sample, 2026-10-10). AVIF lists 'avif'/'mif1'
// and no HEVC brand, so it stays with sharp, which decodes it natively.
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);

export function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.toString('ascii', 4, 8) !== 'ftyp') return false;
  const boxEnd = Math.min(buf.readUInt32BE(0), buf.length);
  const brands = [buf.toString('ascii', 8, 12)];
  for (let o = 16; o + 4 <= boxEnd; o += 4) brands.push(buf.toString('ascii', o, o + 4));
  return brands.some((b) => HEIC_BRANDS.has(b));
}

// sharp's prebuilt libvips reads HEIC headers but cannot decode HEVC pixels, so HEIC goes through
// heic-decode (libheif wasm). libheif applies the file's rotation, so the pixels arrive upright.
async function toSharp(input: string | Buffer): Promise<Sharp> {
  const bytes = typeof input === 'string' ? await readFile(input) : input;
  if (!isHeic(bytes)) return sharp(bytes).autoOrient();
  let decoded: { width: number; height: number; data: Uint8ClampedArray };
  try {
    decoded = await decodeHeic({ buffer: bytes });
  } catch (e) {
    const name = typeof input === 'string' ? input : 'buffer';
    throw new Error(`could not decode HEIC (${name}): ${e instanceof Error ? e.message : String(e)}`);
  }
  const { width, height, data } = decoded;
  return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
}

// What the app will do before upload: orient, fit inside 1000x1000, JPEG, no metadata
// (sharp strips all metadata unless keepMetadata/withMetadata is used).
export async function prepareImage(input: string | Buffer): Promise<Buffer> {
  return (await toSharp(input))
    .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export type PhotoMeta = { taken_at: string | null; approx_location: LatLng | null };

export async function readPhotoMeta(filePath: string): Promise<PhotoMeta> {
  let taken_at: string | null = null;
  let approx_location: LatLng | null = null;
  try {
    const tags = await exifr.parse(filePath, { pick: ['DateTimeOriginal'], reviveValues: false });
    const raw: unknown = tags?.DateTimeOriginal;
    if (typeof raw === 'string' && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
      taken_at = `${raw.slice(0, 4)}-${raw.slice(5, 7)}-${raw.slice(8, 10)}T${raw.slice(11, 19)}`;
    }
  } catch {
    // unreadable EXIF: fall back to null
  }
  try {
    const gps = await exifr.gps(filePath);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude) && !(gps.latitude === 0 && gps.longitude === 0)) {
      approx_location = roundLocation({ lat: gps.latitude, lng: gps.longitude });
    }
  } catch {
    // no GPS block
  }
  return { taken_at, approx_location };
}
