import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareImage } from './image.js';
import { defaultVariant } from './manifest.js';
import { PHOTOS_DIR, resolveRunDir } from './paths.js';
import { renderCard } from './review/public/card.js';
import { cardView } from './review/view.js';
import { summarize } from './summary.js';
import { HARNESS_VENDORS, type HarnessVendor, type ResultRecord, type RunResults, type Scores } from './types.js';

const RANK: Record<string, number> = { send: 0, edit: 1, none: 2, bad: 3 };
const CSS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'review', 'public', 'styles.css');

export function pickCards(
  results: RunResults,
  scores: Scores,
  opts: { pick: number; vendor?: HarnessVendor; ids?: string[] },
): { vendor: HarnessVendor; records: ResultRecord[] } {
  const vendor =
    opts.vendor ?? [...summarize(results, scores)].sort((a, b) => b.send_unedited - a.send_unedited)[0]?.vendor ?? results.vendors[0];
  const order = new Map(results.cases.map((c, i) => [c.id, i]));
  const records = results.cases
    .filter((c) => !opts.ids || opts.ids.includes(c.id))
    .map((c) => results.records.find((r) => r.case_id === c.id && r.vendor === vendor && r.variant === defaultVariant(c)))
    .filter((r): r is ResultRecord => Boolean(r && r.status === 200 && r.card))
    .sort((a, b) => {
      const ra = RANK[scores[`${a.case_id}|${vendor}`]?.verdict ?? 'none'];
      const rb = RANK[scores[`${b.case_id}|${vendor}`]?.verdict ?? 'none'];
      return ra - rb || (order.get(a.case_id) ?? 0) - (order.get(b.case_id) ?? 0);
    })
    .slice(0, opts.pick);
  return { vendor, records };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function renderExport(items: Array<{ imageDataUri: string | null; note: string; html: string }>, css: string): string {
  const body = items
    .map(
      (it) =>
        `<section class="capture">${it.imageDataUri ? `<img src="${it.imageDataUri}" alt="">` : '<p class="label">NOTE-ONLY CAPTURE</p>'}` +
        `${it.note ? `<p class="body">“${esc(it.note)}”</p>` : ''}</section><div class="cols">${it.html}</div>`,
    )
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verge cards</title>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@500&family=Young+Serif&display=swap" rel="stylesheet">
<style>${css}</style></head><body><main>${body}</main></body></html>`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const flagged = new Set(['--pick', '--vendor', '--ids'].flatMap((f) => (argv.includes(f) ? [argv.indexOf(f), argv.indexOf(f) + 1] : [])));
  const runDir = resolveRunDir(argv.find((_, j) => !flagged.has(j)));
  const pick = Number(flag('--pick') ?? 10);
  const vendorArg = flag('--vendor');
  if (vendorArg && !(HARNESS_VENDORS as readonly string[]).includes(vendorArg)) throw new Error(`unknown vendor ${vendorArg}`);
  const ids = flag('--ids')?.split(',').map((s) => s.trim()).filter(Boolean);

  const results: RunResults = JSON.parse(readFileSync(path.join(runDir, 'results.json'), 'utf8'));
  const scoresPath = path.join(runDir, 'scores.json');
  const scores: Scores = existsSync(scoresPath) ? JSON.parse(readFileSync(scoresPath, 'utf8')) : {};
  const { records } = pickCards(results, scores, { pick, vendor: vendorArg as HarnessVendor | undefined, ids });

  const items = await Promise.all(
    records.map(async (r) => {
      const c = results.cases.find((x) => x.id === r.case_id);
      const photo = c?.file ? path.join(PHOTOS_DIR, c.file) : null;
      const imageDataUri = photo && existsSync(photo) ? `data:image/jpeg;base64,${(await prepareImage(photo)).toString('base64')}` : null;
      return { imageDataUri, note: c?.note ?? '', html: renderCard(cardView(r)) };
    }),
  );
  const out = path.join(runDir, 'export.html');
  writeFileSync(out, renderExport(items, readFileSync(CSS_PATH, 'utf8')));
  console.log(`Wrote ${items.length} card(s) to ${out}`);
  console.log('The export omits which vendor produced the cards; `npm run eval:summary` has that.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
