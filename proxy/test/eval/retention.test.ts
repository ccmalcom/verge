import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pruneRuns } from '../../eval/retention.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-10T12:00:00Z');

function makeRun(root: string, name: string, ageDays: number, scored = false) {
  const dir = path.join(root, name);
  mkdirSync(dir);
  writeFileSync(path.join(dir, 'results.json'), '{}');
  if (scored) writeFileSync(path.join(dir, 'scores.json'), '{}');
  const t = new Date(NOW - ageDays * DAY);
  utimesSync(dir, t, t);
}

describe('pruneRuns', () => {
  it('removes unscored runs older than 14 days', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'verge-runs-'));
    makeRun(root, 'old', 20);
    makeRun(root, 'fresh', 2);
    expect(pruneRuns(root, NOW)).toEqual(['old']);
    expect(existsSync(path.join(root, 'fresh'))).toBe(true);
  });

  it('keeps only the newest 10 unscored runs', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'verge-runs-'));
    for (let i = 0; i < 12; i++) makeRun(root, `r${String(i).padStart(2, '0')}`, i * 0.5);
    expect(pruneRuns(root, NOW).sort()).toEqual(['r10', 'r11']);
  });

  it('never prunes a scored run', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'verge-runs-'));
    makeRun(root, 'judged', 400, true);
    expect(pruneRuns(root, NOW)).toEqual([]);
    expect(existsSync(path.join(root, 'judged'))).toBe(true);
  });

  it('is a no-op when the runs dir does not exist', () => {
    expect(pruneRuns(path.join(tmpdir(), 'verge-nope-does-not-exist'), NOW)).toEqual([]);
  });
});
