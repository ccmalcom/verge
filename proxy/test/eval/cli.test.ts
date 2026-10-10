import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../eval/cli.js';

afterEach(() => {
  process.exitCode = undefined;
  delete process.env.VERGE_DEBUG;
  vi.restoreAllMocks();
});

describe('runCli', () => {
  it('prints only the message of a thrown error and sets a failing exit code', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runCli(async () => {
      throw new Error('unknown vendor x');
    });
    expect(err).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledWith('error: unknown vendor x');
    expect(process.exitCode).toBe(1);
  });

  it('prints the full stack when VERGE_DEBUG is set', async () => {
    process.env.VERGE_DEBUG = '1';
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runCli(() => {
      throw new Error('boom');
    });
    expect(String(err.mock.calls[0]?.[0])).toMatch(/^Error: boom\n\s+at /);
  });

  it('leaves the exit code alone when main succeeds', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runCli(async () => {});
    expect(err).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
