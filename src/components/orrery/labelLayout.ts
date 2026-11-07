/**
 * Label collision handling for the orrery (#91). Labels are placed in priority order (the
 * caller's: selected body, the voice line's subject, Sun, Earth, then outward). A label
 * that would overlap a placed one tries stacked slots above and below; if none is free it
 * hides, unless it must show (the voice subject), in which case it takes its last slot
 * anyway. Rough box: monospace ~7 px per character, 16 px tall.
 */
export interface LabelCandidate {
  key: string
  text: string
  x: number
  y: number
  visible: boolean
  /** Never hidden by a collision (the body the voice line names). */
  mustShow?: boolean
}

/** Where a shown label goes: its vertical offset from the body, px. */
export interface LabelPlacement {
  dy: number
}

/**
 * Label priority: the selected body, then the voice line's subject, then boosted craft
 * (#93), then the Sun and Earth (home), then the rest in their given (Sun-outward) order.
 */
export function labelOrder<T extends { name: string }>(
  items: readonly T[],
  selected: string | null,
  subject: string | null,
  /** Craft that rank just after the voice subject (#93: in DSN contact, or deep space). */
  boosted: ReadonlySet<string> = new Set(),
): T[] {
  const rank = (name: string) =>
    name === selected
      ? 0
      : name === subject
        ? 1
        : boosted.has(name)
          ? 1.5
          : name === 'Sun'
            ? 2
            : name === 'Earth'
              ? 3
              : 4
  return [...items].sort((a, b) => rank(a.name) - rank(b.name))
}

const CHAR_PX = 7
const HEIGHT_PX = 16
const OFFSET_X = 8
const PAD = 2
/** Stacked slots tried after the default, in order. */
const SLOTS = [0, -18, 18, -36, 36]

interface Box {
  l: number
  r: number
  t: number
  b: number
}

const overlaps = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t

/**
 * A rim marker for something beyond the view (#93: the Voyagers outside Inner/Outer):
 * where the line from the stage's centre towards its projected point crosses the stage
 * edge, inset. A point behind the camera projects mirrored, so it is flipped first.
 */
export function rimPoint(
  x: number,
  y: number,
  behind: boolean,
  width: number,
  height: number,
  inset: number,
  /** Extra room kept clear at the bottom (the time bar sits there). */
  bottomInset = inset,
): { x: number; y: number; edge: 'top' | 'right' | 'bottom' | 'left' } {
  const left = inset
  const right = width - inset
  const top = inset
  const bottom = height - bottomInset
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  let dx = x - cx
  let dy = y - cy
  if (behind) {
    dx = -dx
    dy = -dy
  }
  if (dx === 0 && dy === 0) return { x: cx, y: top, edge: 'top' }
  const tx = dx === 0 ? Infinity : (dx > 0 ? right - cx : cx - left) / Math.abs(dx)
  const ty = dy === 0 ? Infinity : (dy > 0 ? bottom - cy : cy - top) / Math.abs(dy)
  // Snap the edge it hit exactly, so the marker sits on the rim, not a hair inside it.
  if (tx <= ty) {
    return dx > 0
      ? { x: right, y: cy + dy * tx, edge: 'right' }
      : { x: left, y: cy + dy * tx, edge: 'left' }
  }
  return dy > 0
    ? { x: cx + dx * ty, y: bottom, edge: 'bottom' }
    : { x: cx + dx * ty, y: top, edge: 'top' }
}

export interface RimMarker {
  key: string
  text: string
  x: number
  y: number
  /** On the top or bottom rim: spread along x. On a side rim: along y. */
  alongX: boolean
}

/** Rim marker size, px: mono text plus the arrow and padding. */
const RIM_PAD_PX = 28
const RIM_HEIGHT_PX = 20

/**
 * Rim markers that would overlap slide apart along their rim, in the order given, so
 * two Voyagers past the same edge both stay readable (#93).
 */
export function spreadRim(
  markers: readonly RimMarker[],
  /** Keep top/bottom markers whole inside this horizontal span, px. */
  span: { left: number; right: number } = { left: -Infinity, right: Infinity },
): Map<string, { x: number; y: number }> {
  const placed: Box[] = []
  const out = new Map<string, { x: number; y: number }>()
  for (const m of markers) {
    const w = m.text.length * CHAR_PX + RIM_PAD_PX
    const clampX = (x: number) =>
      m.alongX ? Math.min(span.right - w / 2, Math.max(span.left + w / 2, x)) : x
    const boxAt = (x: number, y: number): Box => ({
      l: x - w / 2,
      r: x + w / 2,
      t: y - RIM_HEIGHT_PX / 2,
      b: y + RIM_HEIGHT_PX / 2,
    })
    let x = clampX(m.x)
    let y = m.y
    // Slide one way along the rim; at the span's end, try the other way instead.
    let direction = 1
    for (let i = 0; i < 24 && placed.some((p) => overlaps(boxAt(x, y), p)); i += 1) {
      if (!m.alongX) {
        y += RIM_HEIGHT_PX
        continue
      }
      const next = x + direction * (w + 4)
      if (clampX(next) !== next) {
        direction = -direction
        x = clampX(m.x)
      } else x = next
    }
    placed.push(boxAt(x, y))
    out.set(m.key, { x, y })
  }
  return out
}

export function layoutLabels(items: readonly LabelCandidate[]): Map<string, LabelPlacement> {
  const placed: Box[] = []
  const shown = new Map<string, LabelPlacement>()
  for (const item of items) {
    if (!item.visible) continue
    const boxAt = (dy: number): Box => ({
      l: item.x + OFFSET_X - PAD,
      r: item.x + OFFSET_X + item.text.length * CHAR_PX + PAD,
      t: item.y + dy - HEIGHT_PX / 2 - PAD,
      b: item.y + dy + HEIGHT_PX / 2 + PAD,
    })
    const free = SLOTS.find((dy) => !placed.some((p) => overlaps(boxAt(dy), p)))
    const dy = free ?? (item.mustShow ? (SLOTS.at(-1) ?? 0) : undefined)
    if (dy === undefined) continue
    placed.push(boxAt(dy))
    shown.set(item.key, { dy })
  }
  return shown
}
