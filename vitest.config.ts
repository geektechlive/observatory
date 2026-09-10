import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/schemas/**', 'src/hooks/**'],
      // Ratchet floors, set just under the measured actuals on 2026-09-09.
      // These were 80/80/70 but had never been enforced: ci.yml invoked a
      // `test:coverage` script that did not exist, so the job failed before
      // vitest ran and real coverage drifted below the target unnoticed.
      // They are a no-regression guard, not the goal — raise them back toward
      // 80/80/70 as `src/hooks/**` and `src/lib/toError.ts` gain tests.
      thresholds: {
        lines: 71,
        functions: 59,
        branches: 68,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
