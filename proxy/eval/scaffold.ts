import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runCli } from './cli.js';
import { readPhotoMeta } from './image.js';
import { scaffold } from './manifest.js';
import { MANIFEST_PATH, PHOTOS_DIR } from './paths.js';
import type { Manifest } from './types.js';

async function main(): Promise<void> {
  mkdirSync(PHOTOS_DIR, { recursive: true });
  const existing: Manifest | null = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : null;
  const { manifest, warnings } = await scaffold(PHOTOS_DIR, existing, readPhotoMeta);
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  const located = manifest.cases.filter((c) => c.approx_location).length;
  console.log(`${manifest.cases.length} case(s), ${located} with location, written to ${MANIFEST_PATH}`);
  if (manifest.cases.length === 0) console.log(`Add photos (and optional same-name .txt notes) to ${PHOTOS_DIR}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void runCli(main);
