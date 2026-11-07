/**
 * The port Playwright's preview server uses for this checkout (#111). A fixed 4173
 * with `reuseExistingServer` let two worktrees running `pnpm verify` at once test
 * against whichever build started first. Hashing the checkout's path gives each one
 * its own server; `E2E_PORT` overrides it.
 */
const FIRST = 4200
const SPAN = 800

export function e2ePort(checkoutPath: string, env: Record<string, string | undefined>): number {
  const forced = Number(env['E2E_PORT'])
  if (Number.isInteger(forced) && forced > 0) return forced
  // FNV-1a: stable across runs and Node versions, unlike anything seeded.
  let hash = 0x811c9dc5
  for (let i = 0; i < checkoutPath.length; i += 1) {
    hash ^= checkoutPath.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return FIRST + (hash % SPAN)
}
