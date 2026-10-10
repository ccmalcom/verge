import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PhotoMeta } from './image.js';
import type { Manifest, ManifestCase, Variant } from './types.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);

export type MetaReader = (filePath: string) => Promise<PhotoMeta>;

export function caseId(base: string): string {
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'case';
}

export function defaultVariant(c: Pick<ManifestCase, 'approx_location'>): Variant {
  return c.approx_location ? 'with' : 'without';
}

export async function scaffold(
  photosDir: string,
  existing: Manifest | null,
  readMeta: MetaReader,
): Promise<{ manifest: Manifest; warnings: string[] }> {
  const warnings: string[] = [];
  const files = existsSync(photosDir) ? readdirSync(photosDir).filter((f) => !f.startsWith('.')).sort() : [];
  const groups = new Map<string, { image?: string; note?: string }>();

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const base = f.slice(0, f.length - ext.length);
    const group = groups.get(base) ?? {};
    if (IMAGE_EXT.has(ext)) {
      if (group.image) {
        warnings.push(`${f}: another image is already named ${base}; skipped`);
        continue;
      }
      group.image = f;
    } else if (ext === '.txt') {
      group.note = f;
    } else {
      warnings.push(`${f}: not an image (.jpg .jpeg .png .webp .heic .heif) or a .txt note; skipped`);
      continue;
    }
    groups.set(base, group);
  }

  const prior = new Map((existing?.cases ?? []).map((c) => [c.id, c]));
  const seen = new Set<string>();
  const cases: ManifestCase[] = [];

  for (const [base, group] of groups) {
    const note = group.note ? readFileSync(path.join(photosDir, group.note), 'utf8').trim() : '';
    if (!group.image && !note) {
      warnings.push(`${group.note}: empty note with no photo; skipped`);
      continue;
    }
    let id = caseId(base);
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);

    const old = prior.get(id);
    if (old) {
      cases.push({ ...old, file: group.image ?? null, note_file: group.note ?? null });
      continue;
    }
    const meta = group.image ? await readMeta(path.join(photosDir, group.image)) : { taken_at: null, approx_location: null };
    const source = path.join(photosDir, group.image ?? (group.note as string));
    cases.push({
      id,
      file: group.image ?? null,
      note_file: group.note ?? null,
      taken_at: meta.taken_at ?? statSync(source).mtime.toISOString(),
      approx_location: meta.approx_location,
      note,
      truth: '',
      neighborhood: '',
    });
  }

  for (const id of prior.keys()) {
    if (!seen.has(id)) warnings.push(`${id}: its files are gone from photos/; dropped from the manifest`);
  }
  cases.sort((a, b) => a.id.localeCompare(b.id));
  return { manifest: { cases }, warnings };
}
