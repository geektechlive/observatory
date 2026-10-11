import { describe, expect, it } from 'vitest'

import { chooseGlobeMode } from '@/lib/globeMode'

const base = { param: null, hasWebGL: true, saveData: false, webglDefault: false }

describe('chooseGlobeMode', () => {
  it('stays on SVG by default until the WebGL globe reaches parity (#44)', () => {
    expect(chooseGlobeMode(base)).toBe('svg')
  })

  it('tries WebGL when asked with ?globe=webgl, or once it is the default', () => {
    expect(chooseGlobeMode({ ...base, param: 'webgl' })).toBe('webgl')
    expect(chooseGlobeMode({ ...base, webglDefault: true })).toBe('webgl')
  })

  it('?globe=svg always wins (the deterministic e2e path)', () => {
    expect(chooseGlobeMode({ ...base, param: 'svg', webglDefault: true })).toBe('svg')
  })

  it('never tries WebGL without a context or when the viewer asked to save data', () => {
    expect(chooseGlobeMode({ ...base, param: 'webgl', hasWebGL: false })).toBe('svg')
    expect(chooseGlobeMode({ ...base, webglDefault: true, saveData: true })).toBe('svg')
  })

  it('an explicit ?globe=webgl overrides save-data (a developer asking for it)', () => {
    expect(chooseGlobeMode({ ...base, param: 'webgl', saveData: true })).toBe('webgl')
  })
})
