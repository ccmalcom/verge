import { execFile, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { InvalidOutputError, VendorError, type GenerateArgs, type GenerateResult, type Generator } from '../src/generate.js';

export type AppleMode = 'device' | 'pcc';
export type FmRunner = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

const MODEL_NAME: Record<AppleMode, string> = { device: 'apple-on-device', pcc: 'apple-pcc' };

export function fmAvailable(): boolean {
  const probe = spawnSync('fm', ['--help'], { stdio: 'ignore' });
  return !probe.error;
}

const defaultRunner: FmRunner = (args) =>
  new Promise((resolve) => {
    execFile('fm', args, { maxBuffer: 10 * 1024 * 1024, timeout: 180_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr || (error ? error.message : '')) });
    });
  });

export function parseFmOutput(stdout: string): unknown {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end <= start) throw new InvalidOutputError('fm output contained no JSON object');
  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch (e) {
    throw new InvalidOutputError(`fm output was not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function appleGenerator(
  mode: AppleMode,
  opts: { runner?: FmRunner; schemaMode?: 'prompt' | 'json-schema' } = {},
): Generator {
  const runner = opts.runner ?? defaultRunner;
  const schemaMode = opts.schemaMode ?? (process.env.APPLE_FM_SCHEMA_MODE === 'json-schema' ? 'json-schema' : 'prompt');

  return async function generate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>> {
    const dir = mkdtempSync(path.join(tmpdir(), 'verge-fm-'));
    try {
      const jsonSchema = JSON.stringify(z.toJSONSchema(args.schema));
      const instructions =
        schemaMode === 'prompt'
          ? `${args.instructions}\n\nRespond with only one JSON object that matches this JSON Schema, and nothing else:\n${jsonSchema}`
          : args.instructions;
      const fmArgs = ['respond', '--instructions', instructions, args.user.text];
      if (args.user.image) {
        const imagePath = path.join(dir, 'capture.jpg');
        writeFileSync(imagePath, args.user.image);
        fmArgs.push('--image', imagePath);
      }
      if (mode === 'pcc') fmArgs.push('--model', 'pcc');
      if (schemaMode === 'json-schema') {
        const schemaPath = path.join(dir, 'schema.json');
        writeFileSync(schemaPath, jsonSchema);
        fmArgs.push('--schema', schemaPath);
      }

      const { code, stdout, stderr } = await runner(fmArgs);
      if (code !== 0) throw new VendorError(`fm exited ${code}: ${stderr.trim() || 'no stderr'}`);
      const parsed = args.schema.safeParse(parseFmOutput(stdout));
      if (!parsed.success) throw new InvalidOutputError(`fm output failed the schema: ${parsed.error.message}`);
      return { output: parsed.data, model: MODEL_NAME[mode], usage: { inputTokens: null, outputTokens: null } };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
