import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { TierOneOutput } from '../src/card/schema.js';
import { aiSdkGenerator, InvalidOutputError, VendorError } from '../src/generate.js';
import { validTierOne } from './fixtures.js';

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

function mockReturning(text: string) {
  return new MockLanguageModelV4({
    doGenerate: { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] },
  });
}

const args = (image?: Uint8Array) => ({
  tier: 'tier1' as const,
  instructions: 'You write cards.',
  user: { text: 'What is this?', image },
  schema: TierOneOutput,
  schemaName: 'answer_card',
});

describe('aiSdkGenerator', () => {
  it('returns the parsed object, the table model id and usage', async () => {
    const model = mockReturning(JSON.stringify(validTierOne()));
    const gen = aiSdkGenerator('anthropic', { modelFor: () => model, maxRetries: 0 });
    const out = await gen(args());
    expect(out.output).toEqual(validTierOne());
    expect(out.model).toBe('claude-haiku-5-5');
    expect(out.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it('sends the image as a jpeg file part', async () => {
    const model = mockReturning(JSON.stringify(validTierOne()));
    const gen = aiSdkGenerator('openai', { modelFor: () => model, maxRetries: 0 });
    await gen(args(new Uint8Array([0xff, 0xd8, 0xff])));
    const prompt = model.doGenerateCalls[0].prompt as Array<{ role: string; content: unknown }>;
    const user = prompt.find((m) => m.role === 'user');
    const parts = user?.content as Array<{ type: string; mediaType?: string }>;
    expect(parts.some((p) => p.type === 'file' && p.mediaType === 'image/jpeg')).toBe(true);
  });

  it('maps schema-invalid output to InvalidOutputError', async () => {
    const model = mockReturning('{"class":"mineral"}');
    const gen = aiSdkGenerator('google', { modelFor: () => model, maxRetries: 0 });
    await expect(gen(args())).rejects.toBeInstanceOf(InvalidOutputError);
  });

  it('maps a provider failure to VendorError', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({ message: 'overloaded', url: 'x', requestBodyValues: {}, statusCode: 529, isRetryable: true });
      },
    });
    const gen = aiSdkGenerator('anthropic', { modelFor: () => model, maxRetries: 0 });
    await expect(gen(args())).rejects.toBeInstanceOf(VendorError);
  });
});
