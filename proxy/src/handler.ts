import { runAsk } from './ask.js';
import { CLOUD_VENDORS, type CloudVendor } from './card/schema.js';
import type { Generator } from './generate.js';

export type LogEntry = {
  vendor: string;
  model: string | null;
  status: number;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
};

export type HandlerDeps = {
  generatorFor: (vendor: CloudVendor) => Generator;
  env: Record<string, string | undefined>;
  log: (entry: LogEntry) => void;
};

const isCloudVendor = (v: unknown): v is CloudVendor =>
  typeof v === 'string' && (CLOUD_VENDORS as readonly string[]).includes(v);

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const defaultVendor: CloudVendor = isCloudVendor(deps.env.CARD_VENDOR) ? deps.env.CARD_VENDOR : 'anthropic';
  const allowOverride = deps.env.ALLOW_VENDOR_OVERRIDE === '1';

  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
      return Response.json({ error: 'bad_request', detail: 'POST only' }, { status: 405, headers: { allow: 'POST' } });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      deps.log({ vendor: defaultVendor, model: null, status: 400, latency_ms: null, input_tokens: null, output_tokens: null });
      return Response.json({ error: 'bad_request', detail: 'body is not JSON' }, { status: 400 });
    }
    const requested = (body as { vendor?: unknown } | null)?.vendor;
    const vendor = allowOverride && isCloudVendor(requested) ? requested : defaultVendor;
    const outcome = await runAsk(body, { generate: deps.generatorFor(vendor), vendor });
    const meta = outcome.status === 200 ? outcome.body.meta : null;
    deps.log({
      vendor,
      model: meta?.model ?? null,
      status: outcome.status,
      latency_ms: meta?.latency_ms ?? null,
      input_tokens: meta?.usage.inputTokens ?? null,
      output_tokens: meta?.usage.outputTokens ?? null,
    });
    return Response.json(outcome.body, { status: outcome.status });
  };
}
