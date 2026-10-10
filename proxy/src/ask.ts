import { roundLocation } from './card/context.js';
import { checkCardRules, enforceCard, enforceDeeper } from './card/enforce.js';
import { DEEPER_INSTRUCTIONS, PROMPT_VERSION, TIER1_INSTRUCTIONS, deeperUserText, tierOneUserText } from './card/prompt.js';
import { AskRequest, DeeperOutput, TierOneOutput, type AskError, type AskMeta, type AskResponse } from './card/schema.js';
import { InvalidOutputError, type GenerateResult, type Generator } from './generate.js';

export const MAX_IMAGE_BYTES = 600 * 1024;

export type AskOutcome = { status: 200; body: AskResponse } | { status: 400 | 413 | 422 | 502; body: AskError };
export type AskDeps = { generate: Generator; vendor: string; now?: () => number };

const fail = (status: 400 | 413 | 422 | 502, error: AskError['error'], detail: string): AskOutcome => ({
  status,
  body: { error, detail },
});

// One retry for output that is malformed or breaks card rules; vendor failures are not retried here
// (the AI SDK already retries transient provider errors).
async function attempt<T>(
  call: () => Promise<GenerateResult<T>>,
  rules: (output: T) => string | null,
): Promise<{ value: GenerateResult<T> } | { error: AskOutcome }> {
  let problem = '';
  for (let i = 0; i < 2; i++) {
    try {
      const value = await call();
      const broken = rules(value.output);
      if (!broken) return { value };
      problem = broken;
    } catch (e) {
      if (e instanceof InvalidOutputError) {
        problem = e.message;
        continue;
      }
      return { error: fail(502, 'vendor_error', e instanceof Error ? e.message : String(e)) };
    }
  }
  return { error: fail(422, 'invalid_output', problem) };
}

function meta(vendor: string, value: GenerateResult<unknown>, capped: boolean, ms: number): AskMeta {
  return { vendor, model: value.model, prompt_version: PROMPT_VERSION, capped, latency_ms: Math.round(ms), usage: value.usage };
}

export async function runAsk(input: unknown, deps: AskDeps): Promise<AskOutcome> {
  const parsed = AskRequest.safeParse(input);
  if (!parsed.success) {
    return fail(400, 'bad_request', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  }
  const req = parsed.data;
  const note = req.note?.trim() || undefined;

  let image: Uint8Array | undefined;
  if (req.image !== undefined) {
    const bytes = Buffer.from(req.image, 'base64');
    if (bytes.length === 0) return fail(400, 'bad_request', 'image: empty or not base64');
    if (bytes.length > MAX_IMAGE_BYTES) {
      return fail(413, 'too_large', `image is ${bytes.length} bytes; the limit is ${MAX_IMAGE_BYTES}`);
    }
    image = bytes;
  }
  if (!image && !note) return fail(400, 'bad_request', 'need an image or a note');

  const ctx = { ...req.context, approx_location: roundLocation(req.context.approx_location) ?? undefined };
  const now = deps.now ?? (() => performance.now());
  const started = now();

  if (req.kind === 'card') {
    const result = await attempt(
      () =>
        deps.generate({
          tier: 'tier1',
          instructions: TIER1_INSTRUCTIONS,
          user: { text: tierOneUserText(ctx, note, Boolean(image)), image },
          schema: TierOneOutput,
          schemaName: 'answer_card',
        }),
      checkCardRules,
    );
    if ('error' in result) return result.error;
    const { card, capped } = enforceCard(result.value.output);
    return { status: 200, body: { card, meta: meta(deps.vendor, result.value, capped, now() - started) } };
  }

  const question = req.question?.trim();
  if (!req.card || !question) return fail(400, 'bad_request', 'deeper needs card and question');
  const card = req.card;
  const result = await attempt(
    () =>
      deps.generate({
        tier: 'deeper',
        instructions: DEEPER_INSTRUCTIONS,
        user: { text: deeperUserText(ctx, card, question, note, Boolean(image)), image },
        schema: DeeperOutput,
        schemaName: 'deeper_answer',
      }),
    () => null,
  );
  if ('error' in result) return result.error;
  return {
    status: 200,
    body: { deeper: enforceDeeper(result.value.output), meta: meta(deps.vendor, result.value, false, now() - started) },
  };
}
