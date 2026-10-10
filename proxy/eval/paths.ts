import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROXY_DIR = path.dirname(EVAL_DIR);
// VERGE_EVAL_DIR lets a real-flow check run in a temp dir without touching Chase's photos.
export const EVAL_DATA_DIR = process.env.VERGE_EVAL_DIR ?? EVAL_DIR;
export const PHOTOS_DIR = path.join(EVAL_DATA_DIR, 'photos');
export const MANIFEST_PATH = path.join(EVAL_DATA_DIR, 'manifest.json');
export const RUNS_DIR = path.join(EVAL_DATA_DIR, 'runs');

export function latestRunDir(runsDir: string = RUNS_DIR): string | null {
  if (!existsSync(runsDir)) return null;
  const runs = readdirSync(runsDir)
    .map((name) => path.join(runsDir, name))
    .filter((p) => existsSync(path.join(p, 'results.json')))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return runs[0] ?? null;
}

export function resolveRunDir(arg?: string, runsDir: string = RUNS_DIR): string {
  if (arg) {
    const candidate = existsSync(arg) ? arg : path.join(runsDir, arg);
    if (!existsSync(path.join(candidate, 'results.json'))) throw new Error(`No results.json in ${candidate}`);
    return candidate;
  }
  const latest = latestRunDir(runsDir);
  if (!latest) throw new Error('No runs yet. Run `npm run eval:run` first.');
  return latest;
}
