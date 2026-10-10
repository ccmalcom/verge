import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { caseId, defaultVariant, scaffold, type MetaReader } from '../../eval/manifest.js';
import type { Manifest } from '../../eval/types.js';

const withMeta: MetaReader = async () => ({ taken_at: '2026-05-01T09:00:00', approx_location: { lat: 39.757, lng: -86.146 } });
const noMeta: MetaReader = async () => ({ taken_at: null, approx_location: null });

function photosDir(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'verge-photos-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  return dir;
}

describe('scaffold', () => {
  it('builds cases from images and notes, needing no manual input', async () => {
    const dir = photosDir({ 'IMG_0001.jpg': 'x', 'IMG_0001.txt': 'by the bakery\n', 'hawk.txt': 'hawk on the steeple' });
    const { manifest, warnings } = await scaffold(dir, null, withMeta);
    expect(warnings).toEqual([]);
    expect(manifest.cases).toEqual([
      { id: 'hawk', file: null, note_file: 'hawk.txt', taken_at: expect.any(String), approx_location: null, note: 'hawk on the steeple', truth: '', neighborhood: '' },
      { id: 'img-0001', file: 'IMG_0001.jpg', note_file: 'IMG_0001.txt', taken_at: '2026-05-01T09:00:00', approx_location: { lat: 39.757, lng: -86.146 }, note: 'by the bakery', truth: '', neighborhood: '' },
    ]);
  });

  it('accepts HEIC photos as cases', async () => {
    const dir = photosDir({ 'IMG_0002.HEIC': 'x', 'IMG_0003.heif': 'x' });
    const { manifest, warnings } = await scaffold(dir, null, withMeta);
    expect(warnings).toEqual([]);
    expect(manifest.cases.map((c) => c.file)).toEqual(['IMG_0002.HEIC', 'IMG_0003.heif']);
  });

  it('warns and skips unknown files and empty note-only cases', async () => {
    const dir = photosDir({ 'notes.md': 'x', 'empty.txt': '   ' });
    const { manifest, warnings } = await scaffold(dir, null, withMeta);
    expect(manifest.cases).toEqual([]);
    expect(warnings.join('\n')).toMatch(/notes\.md/);
    expect(warnings.join('\n')).toMatch(/empty\.txt/);
  });

  it('falls back to mtime when a photo has no EXIF date', async () => {
    const dir = photosDir({ 'screenshot.png': 'x' });
    const when = new Date('2026-07-04T12:00:00Z');
    utimesSync(path.join(dir, 'screenshot.png'), when, when);
    const { manifest } = await scaffold(dir, null, noMeta);
    expect(manifest.cases[0].taken_at).toBe('2026-07-04T12:00:00.000Z');
    expect(manifest.cases[0].approx_location).toBeNull();
  });

  it('preserves edited fields on re-run and drops cases whose files are gone', async () => {
    const dir = photosDir({ 'a.jpg': 'x' });
    const existing: Manifest = {
      cases: [
        { id: 'a', file: 'a.jpg', note_file: null, taken_at: '2026-04-01T08:00:00', approx_location: null, note: 'edited', truth: 'purslane', neighborhood: 'Fountain Square' },
        { id: 'gone', file: 'gone.jpg', note_file: null, taken_at: '2026-04-01T08:00:00', approx_location: null, note: '', truth: '', neighborhood: '' },
      ],
    };
    const { manifest, warnings } = await scaffold(dir, existing, withMeta);
    expect(manifest.cases).toHaveLength(1);
    expect(manifest.cases[0]).toMatchObject({ id: 'a', note: 'edited', truth: 'purslane', neighborhood: 'Fountain Square', taken_at: '2026-04-01T08:00:00' });
    expect(warnings.join('\n')).toMatch(/gone/);
  });
});

describe('helpers', () => {
  it('slugs case ids', () => {
    expect(caseId('IMG 0001 (copy)')).toBe('img-0001-copy');
  });

  it('defaults to the with-location variant only when there is a location', () => {
    expect(defaultVariant({ approx_location: { lat: 1, lng: 2 } })).toBe('with');
    expect(defaultVariant({ approx_location: null })).toBe('without');
  });
});
