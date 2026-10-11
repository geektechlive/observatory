/**
 * Which globe to draw (#46). The SVG globe is always the first paint and the
 * fallback; WebGL is an upgrade loaded after idle.
 *
 * WebGL stays opt-in (?globe=webgl) until the parity matrix (#44) is green, so the
 * redesign branch can land renderer work incrementally without dropping a layer
 * or keyboard access from the default view.
 */
import type { GpuInfo } from './globe3d'

export type GlobeMode = 'svg' | 'webgl'

/** Flip to true when #44's parity matrix is complete. */
export const WEBGL_DEFAULT = false

export interface GlobeModeInput {
  /** The `globe` query parameter, if any. */
  param: string | null
  hasWebGL: boolean
  /** Save-Data or prefers-reduced-data. */
  saveData: boolean
  webglDefault: boolean
}

export function chooseGlobeMode({
  param,
  hasWebGL,
  saveData,
  webglDefault,
}: GlobeModeInput): GlobeMode {
  if (param === 'svg' || !hasWebGL) return 'svg'
  if (param === 'webgl') return 'webgl'
  return webglDefault && !saveData ? 'webgl' : 'svg'
}

function probeWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** GPU facts for gpuTier(); a throwaway context, released immediately. */
export function readGpuInfo(): GpuInfo {
  const isMobile = window.matchMedia('(pointer: coarse)').matches
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return { renderer: 'unknown', maxTextureSize: 0, isMobile }
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unknown'
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { renderer, maxTextureSize, isMobile }
  } catch {
    return { renderer: 'unknown', maxTextureSize: 0, isMobile }
  }
}

/** Browser probe, kept out of chooseGlobeMode so the decision stays pure. */
export function readGlobeModeInput(): GlobeModeInput {
  const param = new URLSearchParams(window.location.search).get('globe')
  const hasWebGL = probeWebGL()
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  const saveData =
    connection?.saveData === true || window.matchMedia('(prefers-reduced-data: reduce)').matches
  return { param, hasWebGL, saveData, webglDefault: WEBGL_DEFAULT }
}
