/**
 * Colour math for the design system: oklch() literals to sRGB hex, and WCAG contrast.
 *
 * Tokens are authored in oklch, but MapLibre's parser rejects oklch() and the globe
 * shader needs plain numbers, so anything that leaves CSS goes through here.
 * Out-of-gamut colours are clipped per channel, which is what the contrast tests
 * assume; every shipped token is in gamut, so the clip only guards typos.
 */

export interface Oklch {
  readonly l: number
  readonly c: number
  readonly h: number
  readonly alpha: number
}

const OKLCH_RE = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/

export function parseOklch(value: string): Oklch | null {
  const m = OKLCH_RE.exec(value.trim())
  if (!m) return null
  return {
    l: Number(m[1]),
    c: Number(m[2]),
    h: Number(m[3]),
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  }
}

/** OKLCH to linear-light sRGB, unclipped (Björn Ottosson's OKLab matrices). */
export function oklchToLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const encode = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
const decode = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

export function oklchToHex(color: Oklch): string {
  return (
    '#' +
    oklchToLinearSrgb(color)
      .map((v) =>
        Math.round(clamp01(encode(clamp01(v))) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => decode(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

/** WCAG 2.x contrast ratio between two opaque #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}
