import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from 'srvx';
import { runAsk } from '../src/ask.js';
import { PROMPT_VERSION } from '../src/card/prompt.js';
import type { CloudVendor } from '../src/card/schema.js';
import { aiSdkGenerator } from '../src/generate.js';
import { createHandler } from '../src/handler.js';
import { estimateCostUsd } from '../src/providers.js';
import { appleGenerator, fmAvailable } from './apple-fm.js';
import { hasKey, loadEnvLocal } from './env.js';
import { prepareImage } from './image.js';
import { MANIFEST_PATH, PHOTOS_DIR, RUNS_DIR } from './paths.js';
import { pruneRuns } from './retention.js';
import {
  HARNESS_VENDORS,
  type Blind,
  type HarnessVendor,
  type LocationMode,
  type Manifest,
  type ManifestCase,
  type ResultRecord,
  type RunResults,
  type Variant,
} from './types.js';

export type RunArgs = { vendors: HarnessVendor[]; location: LocationMode; deeper: boolean; cases: string[] | null; concurrency: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AskFn = (body: Record<string, unknown>) => Promise<{ status: number; body: any }>;

const parseList = (s?: string): string[] => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const isAppleVendor = (v: HarnessVendor): v is 'apple-device' | 'apple-pcc' => v === 'apple-device' || v === 'apple-pcc';

export function parseRunArgs(argv: string[]): RunArgs {
  const out: RunArgs = { vendors: [...HARNESS_VENDORS], location: 'both', deeper: true, cases: null, concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--vendors') {
      out.vendors = parseList(argv[++i]).map((v) => {
        if (!(HARNESS_VENDORS as readonly string[]).includes(v)) throw new Error(`unknown vendor ${v}; expected one of ${HARNESS_VENDORS.join(', ')}`);
        return v as HarnessVendor;
      });
    } else if (a === '--location') {
      const v = argv[++i];
      if (v !== 'both' && v !== 'with' && v !== 'without') throw new Error('--location must be both, with or without');
      out.location = v;
    } else if (a === '--no-deeper') {
      out.deeper = false;
    } else if (a === '--cases') {
      out.cases = parseList(argv[++i]);
    } else if (a === '--concurrency') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error('--concurrency must be a positive integer');
      out.concurrency = n;
    } else {
      throw new Error(`unknown argument ${a}`);
    }
  }
  return out;
}

export function resolveVendors(
  requested: HarnessVendor[],
  probes: { hasKey: (v: CloudVendor) => boolean; fmAvailable: () => boolean },
): { active: HarnessVendor[]; skipped: { vendor: HarnessVendor; reason: string }[] } {
  const active: HarnessVendor[] = [];
  const skipped: { vendor: HarnessVendor; reason: string }[] = [];
  const fm = requested.some(isAppleVendor) ? probes.fmAvailable() : false;
  for (const v of requested) {
    if (isAppleVendor(v)) {
      if (fm) active.push(v);
      else skipped.push({ vendor: v, reason: '`fm` is not on PATH (needs macOS 27 on Apple silicon)' });
    } else if (probes.hasKey(v)) {
      active.push(v);
    } else {
      skipped.push({ vendor: v, reason: 'API key not set in proxy/.env.local' });
    }
  }
  return { active, skipped };
}

export function planRequests(
  cases: ManifestCase[],
  vendors: HarnessVendor[],
  location: LocationMode,
): Array<{ c: ManifestCase; vendor: HarnessVendor; variant: Variant }> {
  const jobs: Array<{ c: ManifestCase; vendor: HarnessVendor; variant: Variant }> = [];
  for (const c of cases) {
    const variants: Variant[] =
      location === 'without' ? ['without'] : location === 'with' ? (c.approx_location ? ['with'] : []) : c.approx_location ? ['with', 'without'] : ['without'];
    for (const variant of variants) for (const vendor of vendors) jobs.push({ c, vendor, variant });
  }
  return jobs;
}

export function buildCardBody(c: ManifestCase, variant: Variant, image: Buffer | null, vendor: HarnessVendor): Record<string, unknown> {
  const context: Record<string, unknown> = { date: c.taken_at };
  if (variant === 'with' && c.approx_location) context.approx_location = c.approx_location;
  if (variant === 'with' && c.neighborhood) context.neighborhood = c.neighborhood;
  return {
    kind: 'card',
    vendor,
    ...(image ? { image: image.toString('base64') } : {}),
    ...(c.note ? { note: c.note } : {}),
    context,
  };
}

export function makeBlind(cases: ManifestCase[], vendors: HarnessVendor[], rand: () => number = Math.random): Blind {
  const blind: Blind = {};
  for (const c of cases) {
    const order = [...vendors];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    blind[c.id] = Object.fromEntries(order.map((v, i) => [String.fromCharCode(65 + i), v]));
  }
  return blind;
}

export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function safeAsk(ask: AskFn, body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  try {
    return await ask(body);
  } catch (e) {
    return { status: 0, body: { error: 'vendor_error', detail: `request failed: ${e instanceof Error ? e.message : String(e)}` } };
  }
}

export async function executeRun(opts: {
  cases: ManifestCase[];
  vendors: HarnessVendor[];
  location: LocationMode;
  deeper: boolean;
  concurrency: number;
  askFor: (vendor: HarnessVendor) => AskFn;
  loadImage: (c: ManifestCase) => Promise<Buffer | null>;
  onProgress?: (done: number, total: number) => void;
}): Promise<ResultRecord[]> {
  const images = new Map<string, Buffer | null>();
  // A photo that fails to load (corrupt, or a non-HEIC file named .heic) fails its own case only.
  const imageErrors = new Map<string, string>();
  for (const c of opts.cases) {
    try {
      images.set(c.id, await opts.loadImage(c));
    } catch (e) {
      imageErrors.set(c.id, `image ${c.file ?? c.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const jobs = planRequests(opts.cases, opts.vendors, opts.location);
  let done = 0;

  return mapPool(jobs, opts.concurrency, async ({ c, vendor, variant }) => {
    const imageError = imageErrors.get(c.id);
    if (imageError !== undefined) {
      opts.onProgress?.(++done, jobs.length);
      return { case_id: c.id, vendor, variant, status: 0, card: null, meta: null, error: { error: 'bad_request', detail: imageError }, deeper: null, cost_usd: null };
    }
    const ask = opts.askFor(vendor);
    const body = buildCardBody(c, variant, images.get(c.id) ?? null, vendor);
    const first = await safeAsk(ask, body);
    const rec: ResultRecord = { case_id: c.id, vendor, variant, status: first.status, card: null, meta: null, error: null, deeper: null, cost_usd: null };
    if (first.status === 200) {
      rec.card = first.body.card;
      rec.meta = first.body.meta;
    } else {
      rec.error = first.body;
    }

    const question = rec.card?.follow_ups[0];
    if (opts.deeper && rec.card && question) {
      const second = await safeAsk(ask, { ...body, kind: 'deeper', card: rec.card, question });
      rec.deeper =
        second.status === 200
          ? { question, status: 200, answer: second.body.deeper, meta: second.body.meta, error: null }
          : { question, status: second.status, answer: null, meta: null, error: second.body };
    }

    const costs = [rec.meta, rec.deeper?.meta ?? null]
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map((m) => estimateCostUsd(m.model, m.usage))
      .filter((n): n is number => n !== null);
    rec.cost_usd = costs.length ? costs.reduce((a, b) => a + b, 0) : null;
    opts.onProgress?.(++done, jobs.length);
    return rec;
  });
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = parseRunArgs(process.argv.slice(2));
  const pruned = pruneRuns(RUNS_DIR, Date.now());
  if (pruned.length) console.log(`Pruned ${pruned.length} old unscored run(s).`);

  if (!existsSync(MANIFEST_PATH)) {
    console.error('No manifest yet. Run `npm run eval:scaffold` first.');
    process.exit(1);
  }
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const cases = args.cases ? manifest.cases.filter((c) => args.cases?.includes(c.id)) : manifest.cases;
  if (cases.length === 0) {
    console.error('No cases to run. Add photos and run `npm run eval:scaffold`.');
    process.exit(1);
  }
  const { active, skipped } = resolveVendors(args.vendors, { hasKey, fmAvailable });
  for (const s of skipped) console.warn(`Skipping ${s.vendor}: ${s.reason}`);
  if (active.length === 0) {
    console.error('No vendors available.');
    process.exit(1);
  }

  const handler = createHandler({
    generatorFor: (v) => aiSdkGenerator(v),
    env: { ...process.env, ALLOW_VENDOR_OVERRIDE: '1' },
    log: () => {},
  });
  const server = serve({ fetch: handler, port: 0, hostname: '127.0.0.1', silent: true });
  await server.ready();
  const base = server.url as string;

  const askFor = (vendor: HarnessVendor): AskFn => {
    if (isAppleVendor(vendor)) {
      const generate = appleGenerator(vendor === 'apple-pcc' ? 'pcc' : 'device');
      return (body) => runAsk(body, { generate, vendor });
    }
    return async (body) => {
      const res = await fetch(new URL('api/ask', base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };
  };

  const startedAt = new Date().toISOString();
  const runId = `${startedAt.replace(/[:.]/g, '-')}-${PROMPT_VERSION}`;
  let records: ResultRecord[];
  try {
    records = await executeRun({
      cases,
      vendors: active,
      location: args.location,
      deeper: args.deeper,
      concurrency: args.concurrency,
      askFor,
      loadImage: async (c) => (c.file ? prepareImage(path.join(PHOTOS_DIR, c.file)) : null),
      onProgress: (done, total) => process.stdout.write(`\r${done}/${total} requests`),
    });
  } finally {
    await server.close();
  }
  process.stdout.write('\n');

  const runDir = path.join(RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });
  const results: RunResults = { run_id: runId, prompt_version: PROMPT_VERSION, started_at: startedAt, vendors: active, skipped_vendors: skipped, cases, records };
  writeFileSync(path.join(runDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(path.join(runDir, 'blind.json'), `${JSON.stringify(makeBlind(cases, active), null, 2)}\n`);

  const failed = records.filter((r) => r.status !== 200).length;
  console.log(`${records.length} card request(s), ${failed} failed. Saved to ${runDir}`);
  console.log('Next: npm run eval:review');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
