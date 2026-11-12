import { defineConfig, devices } from '@playwright/test'

import { e2ePort } from './tests/e2ePort'
import { assertUnderTestLock } from './tests/testLockGuard'

// One test run at a time on this machine (#224, ADR 0027): use `pnpm test:e2e`.
assertUnderTestLock(process.env, 'playwright')

// One preview server per checkout, so parallel worktrees never test each other's
// build (#111).
const PORT = e2ePort(import.meta.dirname, process.env)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // Headless Chromium already gets WebGL through SwiftShader. Don't pin
      // --use-angle=swiftshader: it forces software rendering for every page and
      // slowed the suite 2.5x, enough to time out instrument.spec. If Chrome drops
      // the fallback, globe-webgl.spec fails loudly on data-globe-mode (#46).
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/mobile.spec.ts',
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: '**/mobile.spec.ts',
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
})
