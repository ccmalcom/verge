// Entry-point wrapper for the eval commands: a failure prints its message, not an
// unhandled-rejection stack trace. VERGE_DEBUG=1 prints the full stack.
export async function runCli(main: () => unknown): Promise<void> {
  try {
    await main();
  } catch (e) {
    const debug = Boolean(process.env.VERGE_DEBUG);
    console.error(e instanceof Error ? (debug ? (e.stack ?? e.message) : `error: ${e.message}`) : `error: ${String(e)}`);
    process.exitCode = 1;
  }
}
