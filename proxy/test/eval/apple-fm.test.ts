import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appleGenerator, parseFmOutput, type FmRunner } from '../../eval/apple-fm.js';
import { TierOneOutput } from '../../src/card/schema.js';
import { InvalidOutputError, VendorError } from '../../src/generate.js';
import { validTierOne } from '../fixtures.js';

function stubRunner(result: { code: number; stdout: string; stderr?: string }) {
  const calls: string[][] = [];
  const runner: FmRunner = async (args) => {
    calls.push(args);
    return { code: result.code, stdout: result.stdout, stderr: result.stderr ?? '' };
  };
  return { runner, calls };
}

const args = (image?: Uint8Array) => ({
  tier: 'tier1' as const,
  instructions: 'You write cards.',
  user: { text: 'What is this?', image },
  schema: TierOneOutput,
  schemaName: 'answer_card',
});

describe('parseFmOutput', () => {
  it('parses bare and fenced JSON', () => {
    expect(parseFmOutput('{"a":1}')).toEqual({ a: 1 });
    expect(parseFmOutput('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('throws InvalidOutputError when there is no JSON object', () => {
    expect(() => parseFmOutput('I cannot help with that.')).toThrow(InvalidOutputError);
  });
});

describe('appleGenerator', () => {
  it('runs on-device with an image and returns validated output', async () => {
    const { runner, calls } = stubRunner({ code: 0, stdout: JSON.stringify(validTierOne()) });
    const out = await appleGenerator('device', { runner })(args(new Uint8Array([0xff, 0xd8, 0xff])));
    expect(out.output).toEqual(validTierOne());
    expect(out.model).toBe('apple-on-device');
    expect(out.usage).toEqual({ inputTokens: null, outputTokens: null });
    const a = calls[0];
    expect(a[0]).toBe('respond');
    expect(a).toContain('--image');
    expect(a).not.toContain('--model');
    expect(a).not.toContain('--schema');
    expect(a[a.indexOf('--instructions') + 1]).toMatch(/JSON/);
  });

  it('adds --model pcc for Private Cloud Compute', async () => {
    const { runner, calls } = stubRunner({ code: 0, stdout: JSON.stringify(validTierOne()) });
    const out = await appleGenerator('pcc', { runner })(args());
    expect(out.model).toBe('apple-pcc');
    expect(calls[0].slice(calls[0].indexOf('--model'), calls[0].indexOf('--model') + 2)).toEqual(['--model', 'pcc']);
    expect(calls[0]).not.toContain('--image');
  });

  it('passes a JSON Schema file in json-schema mode', async () => {
    // The temp dir is removed when the call returns, so read the file during the call.
    let captured = '';
    const runner: FmRunner = async (a) => {
      captured = readFileSync(a[a.indexOf('--schema') + 1], 'utf8');
      return { code: 0, stdout: JSON.stringify(validTierOne()), stderr: '' };
    };
    await appleGenerator('device', { runner, schemaMode: 'json-schema' })(args());
    expect((JSON.parse(captured) as { required: string[] }).required).toContain('confidence');
  });

  it('maps schema-invalid output to InvalidOutputError', async () => {
    const { runner } = stubRunner({ code: 0, stdout: '{"class":"mineral"}' });
    await expect(appleGenerator('device', { runner })(args())).rejects.toBeInstanceOf(InvalidOutputError);
  });

  it('maps a non-zero exit (e.g. context window exceeded) to VendorError carrying stderr', async () => {
    const { runner } = stubRunner({ code: 1, stdout: '', stderr: 'Error: exceeded context window size' });
    await expect(appleGenerator('device', { runner })(args())).rejects.toThrow(/exceeded context window/);
    await expect(appleGenerator('device', { runner })(args())).rejects.toBeInstanceOf(VendorError);
  });
});
