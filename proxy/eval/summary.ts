import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultVariant } from './manifest.js';
import { resolveRunDir } from './paths.js';
import type { HarnessVendor, ResultRecord, RunResults, ScoreEntry, Scores } from './types.js';

export type VendorSummary = {
  vendor: HarnessVendor;
  cases: number;
  judged: number;
  send_unedited: number;
  needs_edit: number;
  bad: number;
  accuracy: number | null;
  safety_misses: number;
  capped: number;
  cant_tell: number;
  errors: number;
  location: { helped: number; same: number; hurt: number };
  p50_latency_ms: number | null;
  mean_cost_usd: number | null;
};

// The spec's bar: 20 of 30 cards send-unedited, i.e. two thirds of the cases.
export function passBar(cases: number): number {
  return Math.ceil((cases * 2) / 3);
}

export function summarize(results: RunResults, scores: Scores): VendorSummary[] {
  return results.vendors.map((vendor) => {
    const all = results.records.filter((r) => r.vendor === vendor);
    const defaults = results.cases
      .map((c) => all.find((r) => r.case_id === c.id && r.variant === defaultVariant(c)))
      .filter((r): r is ResultRecord => Boolean(r));
    const entries = results.cases.map((c) => scores[`${c.id}|${vendor}`]).filter((s): s is ScoreEntry => Boolean(s));
    const judged = entries.filter((s) => s.verdict);
    const corrected = judged.filter((s) => s.actually.trim());
    const latencies = all
      .map((r) => r.meta?.latency_ms)
      .filter((n): n is number => typeof n === 'number')
      .sort((a, b) => a - b);
    const costs = all.map((r) => r.cost_usd).filter((n): n is number => typeof n === 'number');
    return {
      vendor,
      cases: results.cases.length,
      judged: judged.length,
      send_unedited: judged.filter((s) => s.verdict === 'send').length,
      needs_edit: judged.filter((s) => s.verdict === 'edit').length,
      bad: judged.filter((s) => s.verdict === 'bad').length,
      accuracy: judged.length ? (judged.length - corrected.length) / judged.length : null,
      safety_misses: entries.filter((s) => s.safety_should_fire).length,
      capped: defaults.filter((r) => r.meta?.capped).length,
      cant_tell: defaults.filter((r) => r.card?.confidence === 'cant_tell').length,
      errors: all.filter((r) => r.status !== 200).length,
      location: {
        helped: entries.filter((s) => s.location === 'helped').length,
        same: entries.filter((s) => s.location === 'same').length,
        hurt: entries.filter((s) => s.location === 'hurt').length,
      },
      p50_latency_ms: latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null,
      mean_cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    };
  });
}

const pct = (n: number | null) => (n === null ? '-' : `${Math.round(n * 100)}%`);

export function formatSummary(rows: VendorSummary[], compare?: VendorSummary[]): string {
  const lines: string[] = [];
  const bar = rows[0] ? passBar(rows[0].cases) : 0;
  lines.push(`Pass bar: ${bar} of ${rows[0]?.cases ?? 0} send-unedited (spec: 20 of 30).`);
  lines.push('');
  for (const r of rows) {
    const prev = compare?.find((c) => c.vendor === r.vendor);
    const delta = prev ? ` (${r.send_unedited - prev.send_unedited >= 0 ? '+' : ''}${r.send_unedited - prev.send_unedited})` : '';
    lines.push(
      `${r.vendor.padEnd(13)} send ${r.send_unedited}/${r.cases}${delta}  edit ${r.needs_edit}  bad ${r.bad}  judged ${r.judged}` +
        `  ${r.send_unedited >= bar && r.cases > 0 ? 'PASS' : ''}`,
    );
    lines.push(
      `${''.padEnd(13)} accuracy ${pct(r.accuracy)}  safety misses ${r.safety_misses}  capped ${r.capped}  can't tell ${r.cant_tell}  errors ${r.errors}`,
    );
    lines.push(
      `${''.padEnd(13)} location helped/same/hurt ${r.location.helped}/${r.location.same}/${r.location.hurt}` +
        `  p50 ${r.p50_latency_ms ?? '-'} ms  cost/ask ${r.mean_cost_usd === null ? '-' : `$${r.mean_cost_usd.toFixed(4)}`}`,
    );
  }
  return lines.join('\n');
}

function load(runDir: string): { results: RunResults; scores: Scores } {
  const results: RunResults = JSON.parse(readFileSync(path.join(runDir, 'results.json'), 'utf8'));
  const scoresPath = path.join(runDir, 'scores.json');
  return { results, scores: existsSync(scoresPath) ? JSON.parse(readFileSync(scoresPath, 'utf8')) : {} };
}

function main(): void {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--compare');
  const compareArg = i >= 0 ? argv[i + 1] : undefined;
  const positional = argv.find((a, j) => a !== '--compare' && !(i >= 0 && j === i + 1));
  const current = load(resolveRunDir(positional));
  const compare = compareArg ? load(resolveRunDir(compareArg)) : null;
  console.log(`Run ${current.results.run_id} (prompt ${current.results.prompt_version})`);
  if (compare) console.log(`Compared with ${compare.results.run_id} (prompt ${compare.results.prompt_version})`);
  console.log(formatSummary(summarize(current.results, current.scores), compare ? summarize(compare.results, compare.scores) : undefined));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
