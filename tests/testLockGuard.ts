/**
 * Test runners refuse to start outside scripts/test-lock.mjs (#224, ADR 0027), so
 * two worktrees' suites can never overlap. Keep the name in step with HELD_ENV there.
 */
const HELD_ENV = 'OBS_TEST_LOCK_HELD'

const USE: Record<'playwright' | 'vitest', string> = {
  playwright: 'pnpm test:e2e [spec ...]',
  vitest: 'pnpm test:unit [file ...]',
}

export function assertUnderTestLock(
  env: Record<string, string | undefined>,
  runner: 'playwright' | 'vitest',
): void {
  if (env[HELD_ENV] === '1') return
  throw new Error(
    `${runner} must run inside the machine-wide test lock (#224). Use \`${USE[runner]}\` ` +
      'instead of calling the runner directly; it waits for any other test run to finish.',
  )
}
