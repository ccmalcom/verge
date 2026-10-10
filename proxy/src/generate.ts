import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output, type LanguageModel } from 'ai';
import type { z } from 'zod';
import type { CloudVendor } from './card/schema.js';
import { languageModel, MODELS } from './providers.js';

export type Tier = 'tier1' | 'deeper';
export type UserContent = { text: string; image?: Uint8Array };
export type GenerateArgs<T> = {
  tier: Tier;
  instructions: string;
  user: UserContent;
  schema: z.ZodType<T>;
  schemaName: string;
};
export type GenerateResult<T> = {
  output: T;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
};
// The vendor seam. Cloud vendors use aiSdkGenerator; the harness adds an `fm` CLI one.
export type Generator = <T>(args: GenerateArgs<T>) => Promise<GenerateResult<T>>;

// The model answered, but not in the required shape. Worth one retry.
export class InvalidOutputError extends Error {}
// The vendor failed (HTTP error, overload, timeout, network). Not retried by us.
export class VendorError extends Error {}

export function aiSdkGenerator(
  vendor: CloudVendor,
  opts: { modelFor?: (tier: Tier) => LanguageModel; maxRetries?: number; timeoutMs?: number } = {},
): Generator {
  const modelFor = opts.modelFor ?? ((tier: Tier) => languageModel(vendor, tier));
  return async function generate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>> {
    const content: Array<{ type: 'text'; text: string } | { type: 'file'; mediaType: string; data: Uint8Array }> = [
      { type: 'text', text: args.user.text },
    ];
    if (args.user.image) content.push({ type: 'file', mediaType: 'image/jpeg', data: args.user.image });
    try {
      const result = await generateText({
        model: modelFor(args.tier),
        instructions: args.instructions,
        messages: [{ role: 'user', content }],
        output: Output.object({ schema: args.schema, name: args.schemaName }),
        maxRetries: opts.maxRetries ?? 2,
        timeout: opts.timeoutMs ?? 60_000,
      });
      return {
        output: result.output as T,
        model: MODELS[vendor][args.tier],
        usage: { inputTokens: result.usage.inputTokens ?? null, outputTokens: result.usage.outputTokens ?? null },
      };
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e) || NoOutputGeneratedError.isInstance(e)) {
        throw new InvalidOutputError(e.message);
      }
      throw new VendorError(e instanceof Error ? e.message : String(e));
    }
  };
}
