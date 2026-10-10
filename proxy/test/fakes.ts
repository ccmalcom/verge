import type { GenerateArgs, GenerateResult, Generator } from '../src/generate.js';

// Each call consumes the next scripted item: an Error is thrown, anything else is the output.
export function fakeGenerator(script: Array<unknown | Error>): Generator & { calls: GenerateArgs<unknown>[] } {
  const calls: GenerateArgs<unknown>[] = [];
  const gen = (async (args: GenerateArgs<unknown>): Promise<GenerateResult<unknown>> => {
    calls.push(args);
    const next = script.shift();
    if (next === undefined) throw new Error('fakeGenerator: script exhausted');
    if (next instanceof Error) throw next;
    return { output: next, model: `fake-${args.tier}`, usage: { inputTokens: 100, outputTokens: 50 } };
  }) as Generator & { calls: GenerateArgs<unknown>[] };
  gen.calls = calls;
  return gen;
}
