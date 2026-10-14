/**
 * Which globe to draw (#46). The SVG globe is always the first paint and the
 * fallback; WebGL is an upgrade loaded after idle.
 *
 * WebGL was opt-in (?globe=webgl) until the parity matrix (#44) went green, so the
 * renderer could land incrementally without dropping a layer or keyboard access.
 * It is now the default; ?globe=svg forces the SVG globe.
 */
import type { GpuInfo } from './globe3d'

export type GlobeMode = 'svg' | 'webgl'

/** On since the #44 parity matrix went green: every layer drawn, a11y overlay, tested fallbacks. */
export const WEBGL_DEFAULT = true

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
