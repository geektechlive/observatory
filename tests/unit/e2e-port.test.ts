import { describe, expect, it } from 'vitest'

import { e2ePort } from '../e2ePort'

describe('e2ePort (#111)', () => {
  const main = '/Users/x/Source/observatory'
  const tree = '/Users/x/Source/observatory/.claude/worktrees/map-legend-106'

  it('is stable for one checkout', () => {
    expect(e2ePort(tree, {})).toBe(e2ePort(tree, {}))
  })

  it('differs between two checkouts, so parallel verify runs never share a server', () => {
    expect(e2ePort(main, {})).not.toBe(e2ePort(tree, {}))
  })

  it('stays in 4200-4999', () => {
    for (const path of [main, tree, '/', 'a', '/tmp/w/agent-a0f5ee5d8f0a4c70e']) {
      const port = e2ePort(path, {})
      expect(port).toBeGreaterThanOrEqual(4200)
      expect(port).toBeLessThanOrEqual(4999)
    }
  })

  it('takes E2E_PORT when set', () => {
    expect(e2ePort(tree, { E2E_PORT: '4555' })).toBe(4555)
  })
})
