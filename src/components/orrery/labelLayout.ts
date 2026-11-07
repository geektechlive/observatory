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
 * Label priority: the selected body, then the voice line's subject, then the Sun and
 * Earth (home), then the rest in their given (Sun-outward) order.
 */
export function labelOrder<T extends { name: string }>(
  items: readonly T[],
  selected: string | null,
  subject: string | null,
): T[] {
  const rank = (name: string) =>
    name === selected ? 0 : name === subject ? 1 : name === 'Sun' ? 2 : name === 'Earth' ? 3 : 4
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
