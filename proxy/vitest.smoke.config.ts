import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/smoke/**/*.test.ts'], testTimeout: 120_000 },
});
