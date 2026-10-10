import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const DAY_MS = 86_400_000;

// Unscored runs: pruned when older than maxAgeDays or outside the newest keepUnscored.
// Scored runs (scores.json present) are judged evidence and are never pruned.
export function pruneRuns(
  runsDir: string,
  nowMs: number,
  opts: { maxAgeDays?: number; keepUnscored?: number } = {},
): string[] {
  const maxAgeDays = opts.maxAgeDays ?? 14;
  const keepUnscored = opts.keepUnscored ?? 10;
  if (!existsSync(runsDir)) return [];
  const unscored = readdirSync(runsDir)
    .map((name) => ({ name, dir: path.join(runsDir, name) }))
    .filter(({ dir }) => statSync(dir).isDirectory() && !existsSync(path.join(dir, 'scores.json')))
    .map((r) => ({ ...r, mtime: statSync(r.dir).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const removed: string[] = [];
  unscored.forEach((run, index) => {
    if (index >= keepUnscored || nowMs - run.mtime > maxAgeDays * DAY_MS) {
      rmSync(run.dir, { recursive: true, force: true });
      removed.push(run.name);
    }
  });
  return removed;
}
