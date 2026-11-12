/**
 * Label collision handling for the orrery (#91). Labels are placed in priority order (the
 * caller's: selected body, the voice line's subject, Sun, Earth, then outward). A label
 * that would overlap a placed one tries stacked slots above and below; if none is free it
 * hides, unless it must show (the voice subject), in which case it takes its last slot
 * anyway. Rough box: monospace ~7 px per character, 16 px tall.
 *
 * #92: labels on one line keep a gap ("Mars Venus" read as one phrase), every label
 * keeps off other bodies' dots ("Sun" sat on Saturn's), and a label that would run off
 * the stage's right edge goes to the left of its body.
 */
import { SATURN_RINGS } from '@/lib/orrery/imagery'

export interface LabelCandidate {
  key: string
  text: string
  x: number
  y: number
  visible: boolean
  /** Never hidden by a collision (the body the voice line names). */
  mustShow?: boolean
  /**
   * Step right past a disc it lands on (#107: Juno sat on Jupiter). Every label keeps off
   * other bodies' discs (#92); this only adds the sideways step.
   */
  avoidDiscs?: boolean
  /**
   * A home label (Earth, the Sun, the selected body): when every slot would cover
   * another body's dot, it shows anyway, over the dot, rather than hide.
   */
  priority?: boolean
  /**
   * Try the farther rungs (±54, ±72 px, with a leader) before hiding, as a home label does
   * (#131: the planets in the Heliosphere view at 1280 x 720; a focused planet's moons).
   */
  farRungs?: boolean
  /** Its rendered width, px, when known (a shown label); else ~7 px a character. */
  widthPx?: number | undefined
  /** Its body's drawn radius, px (`x` is already past it): the left side needs it. */
  reach?: number
}

/** A planet's drawn disc on screen, px. */
export interface LabelDisc {
  /** Whose disc: a label never avoids its own body's. */
  key?: string
  x: number
  y: number
  r: number
}

/** Where a shown label goes: its vertical offset from the body, px, and a sideways one
 *  when it had to step off a planet's disc. */
export interface LabelPlacement {
  dy: number
  dx?: number
  /** 'left': placed to the left of its body, because the right ran off the stage (#92). */
  side?: 'left'
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

/**
 * The key the labels rank the chosen object by (#216): a looked-up object drawn by its
 * close-approach twin is labelled as that approach (`chosen` on the projected item), so
 * the approach ranks as chosen; otherwise the chosen key itself.
 */
export function labelRankKey(
  items: readonly { name: string; chosen?: boolean | undefined }[],
  selected: string | null,
): string | null {
  return items.find((i) => i.chosen === true)?.name ?? selected
}

/** Below this stage width, px, close-approach labels are capped (#130). */
export const SMALL_STAGE_PX = 600
/**
 * How many close-approach labels a small stage shows (#130). On a 390 px phone the
 * Earth–Moon view had 10 of its 25 labelled (2026-11-11), piled round Earth; six leaves room for
 * Earth, the Moon and the L1 craft, and the hazardous ones rank first so they
 * keep their names. The dots all stay.
 */
export const ASTEROID_LABELS_SMALL_STAGE = 6

/**
 * Which close approaches get a label (#130): all of them on a wide stage; on a small one,
 * the hazardous first, then the closest miss, up to the cap, and always the selected one.
 */
export function asteroidLabelKeys(
  approaches: readonly { key: string; pha: boolean; distAu: number }[],
  selected: string | null,
  stageWidth: number,
): Set<string> {
  if (stageWidth >= SMALL_STAGE_PX) return new Set(approaches.map((a) => a.key))
  const ranked = [...approaches].sort(
    (a, b) => Number(b.pha) - Number(a.pha) || a.distAu - b.distAu,
  )
  const keys = ranked.slice(0, ASTEROID_LABELS_SMALL_STAGE).map((a) => a.key)
  return new Set(
    selected && approaches.some((a) => a.key === selected) ? [...keys, selected] : keys,
  )
}

/**
 * How many times the focus's distance from the camera a craft must be to count as far
 * beyond it (#126). Measured 2026-11-11: in Parker's close-up the focus is 4.0 scene units
 * away, Venus 3.05 and Voyager 2 20.4; in Jupiter's, the moons are within 1.1 times the
 * focus and the Voyagers at least 4 times.
 */
export const FAR_DEPTH_RATIO = 3

/** A craft drawn in a close-up but far beyond the focus: its label adds its distance. */
export function farBeyondFocus(depth: number, focusDepth: number | undefined): boolean {
  return focusDepth !== undefined && focusDepth > 0 && depth >= FAR_DEPTH_RATIO * focusDepth
}

const CHAR_PX = 7
/** The width estimate per character, px, for a label not measured yet. */
export const LABEL_CHAR_PX = CHAR_PX
const HEIGHT_PX = 16
const OFFSET_X = 8
const PAD = 2
/** Horizontal padding each side, px: two labels on one line keep twice this apart (#92). */
const PAD_X = 5
/** Stacked slots tried after the default, in order. */
const SLOTS = [0, -18, 18, -36, 36]
/** Farther rungs: a home label (`priority`, #92) and a `farRungs` label (#131) try these
 *  before they give up. */
const FAR_SLOTS = [-54, 54, -72, 72]
const PRIORITY_SLOTS = [...SLOTS, ...FAR_SLOTS]

interface Box {
  readonly l: number
  readonly r: number
  readonly t: number
  readonly b: number
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
  /**
   * Which rim it sits on. The page anchors a left marker at its left end and a right one
   * at its right end (orrery.module.css); top and bottom markers are centred.
   */
  edge?: 'top' | 'right' | 'bottom' | 'left'
  /** Its rendered width, px, when known; the estimate is used when that is wider. */
  widthPx?: number | undefined
}

/** Rim marker size, px: mono text plus the arrow and padding. */
const RIM_PAD_PX = 28
const RIM_HEIGHT_PX = 20

const rimWidth = (m: RimMarker) => Math.max(m.text.length * CHAR_PX + RIM_PAD_PX, m.widthPx ?? 0)

/** The screen box a rim marker covers when drawn at `at`, px (#160). */
export function rimBox(m: RimMarker, at: { x: number; y: number }): Box {
  const w = rimWidth(m)
  const l = m.edge === 'left' ? at.x : m.edge === 'right' ? at.x - w : at.x - w / 2
  return { l, r: l + w, t: at.y - RIM_HEIGHT_PX / 2, b: at.y + RIM_HEIGHT_PX / 2 }
}

/** The rim a marker may use, px: top/bottom markers stay whole inside left..right, side
 *  markers inside top..bottom. */
export interface RimSpan {
  left: number
  right: number
  top?: number
  bottom?: number
}

/** How many steps each way along its rim a marker tries before it stays put. */
const RIM_TRIES = 12
/** When the rim itself is full, how many rows in it may step, and how far each, px. */
const RIM_STEPS_IN = 3
const RIM_STEP_IN_PX = RIM_HEIGHT_PX + 8

/** A placed rim marker: where it is drawn and the box it covers. */
export interface RimPlace {
  x: number
  y: number
  box: LabelObstacle
}

/**
 * Rim markers that would overlap slide apart along their rim, in the order given, so
 * two Voyagers past the same edge both stay readable (#93). They also slide off the
 * stage's furniture, the badge, the guide chip, the buttons and the inspector (#160,
 * #132): the nearest free spot along the rim, either way, inside the span, stepping in
 * from the rim when it is full. One with no free spot stays where it lands.
 */
export function spreadRim(
  markers: readonly RimMarker[],
  span: RimSpan = { left: -Infinity, right: Infinity },
  obstacles: readonly LabelObstacle[] = [],
): Map<string, RimPlace> {
  const placed: Box[] = [...obstacles]
  const out = new Map<string, RimPlace>()
  for (const m of markers) {
    const p = placeRim(m, span, placed, 0, RIM_STEPS_IN) ?? rimStart(m, span)
    placed.push(p.box)
    out.set(m.key, p)
  }
  return out
}

/** Where a marker lands before any sliding: its point, held inside the span. */
function rimStart(m: RimMarker, span: RimSpan): RimPlace {
  const at = rimClamp(m, span, m)
  return { ...at, box: rimBox(m, at) }
}

/** Keep a marker's whole box inside the span along its rim. */
function rimClamp(m: RimMarker, span: RimSpan, at: { x: number; y: number }) {
  if (m.alongX) {
    const half = rimWidth(m) / 2
    return { x: Math.min(span.right - half, Math.max(span.left + half, at.x)), y: at.y }
  }
  const half = RIM_HEIGHT_PX / 2
  const top = span.top ?? -Infinity
  const bottom = span.bottom ?? Infinity
  return { x: at.x, y: Math.min(bottom - half, Math.max(top + half, at.y)) }
}

/**
 * The nearest free spot for one marker, rows `fromDepth` to `toDepth` in from its rim
 * (0 is the rim itself), or undefined when every spot is taken.
 */
function placeRim(
  m: RimMarker,
  span: RimSpan,
  taken: readonly Box[],
  fromDepth: number,
  toDepth: number,
): RimPlace | undefined {
  const step = m.alongX ? rimWidth(m) + 4 : RIM_HEIGHT_PX + 2
  const start = rimClamp(m, span, m)
  const free = (at: { x: number; y: number }) => !taken.some((p) => overlaps(rimBox(m, at), p))
  // Inward, away from the rim: only when the rim itself is full (a phone's top row is
  // Controls, Guide and the badge).
  const inward = {
    top: { x: 0, y: 1 },
    bottom: { x: 0, y: -1 },
    left: { x: 1, y: 0 },
    right: { x: -1, y: 0 },
  }[m.edge ?? 'top']
  for (let depth = fromDepth; depth <= toDepth; depth += 1) {
    const line = {
      x: start.x + inward.x * depth * RIM_STEP_IN_PX,
      y: start.y + inward.y * depth * RIM_STEP_IN_PX,
    }
    // The nearest free spot on this line: 0, +1, -1, +2, -2 steps along the rim.
    for (let i = 0; i <= 2 * RIM_TRIES; i += 1) {
      const k = i === 0 ? 0 : i % 2 === 1 ? (i + 1) / 2 : -i / 2
      const raw = m.alongX
        ? { x: line.x + k * step, y: line.y }
        : { x: line.x, y: line.y + k * step }
      const at = rimClamp(m, span, raw)
      // A clamped spot that is not where the step put it is past the span's end.
      if (k !== 0 && (at.x !== raw.x || at.y !== raw.y)) continue
      if (free(at)) return { ...at, box: rimBox(m, at) }
    }
  }
  return undefined
}

const discBox = (d: LabelDisc): Box => ({ l: d.x - d.r, r: d.x + d.r, t: d.y - d.r, b: d.y + d.r })

/** Saturn's rings reach this many of its globe's radii (Jónsson's ring profile, #105). */
const SATURN_RING_REACH = SATURN_RINGS.outerKm / SATURN_RINGS.saturnRadiusKm

/**
 * How far from a body's centre its label starts, and its disc reaches for other labels,
 * px: the drawn radius, or for Saturn its rings' outer edge (#119: its label sat on the
 * rings when the camera was close).
 */
export function bodyLabelReach(name: string, radiusPx: number): number {
  return name === 'Saturn' ? radiusPx * SATURN_RING_REACH : radiusPx
}

/** A screen box no label may cover (the NOT TO SCALE badge, #118), px. */
export type LabelObstacle = Box

export function layoutLabels(
  items: readonly LabelCandidate[],
  discs: readonly LabelDisc[] = [],
  /** Every label moves around these, trying its other slots before hiding (#118). */
  obstacles: readonly LabelObstacle[] = [],
  /** The stage, px: a slot above or below it is not free (it would be off-screen). */
  bounds?: { readonly width: number; readonly height: number },
): Map<string, LabelPlacement> {
  return placeLabels(items, discs, obstacles, bounds, undefined).shown
}

interface Slot {
  readonly dy: number
  readonly left: boolean
}

/**
 * The slots in the order tried: the near ones on the right, then, when every one is
 * taken, by the stage's edge (#92) or by a crowd (#127: Callisto beside Jupiter's disc on
 * a phone), the same on the left; a home label or a planet (#131) then tries the farther
 * rungs, right then left. Built once: the layout runs every drawn frame.
 */
const NEAR_SLOTS: readonly Slot[] = [false, true].flatMap((left) =>
  SLOTS.map((dy) => ({ dy, left })),
)
const NEAR_AND_FAR_SLOTS: readonly Slot[] = [
  ...NEAR_SLOTS,
  ...[false, true].flatMap((left) => FAR_SLOTS.map((dy) => ({ dy, left }))),
]

/** layoutLabels, with the boxes the shown labels cover (layoutStage keeps rim markers
 *  that had to step in off them), and last frame's placements to hold while free. */
function placeLabels(
  items: readonly LabelCandidate[],
  discs: readonly LabelDisc[],
  obstacles: readonly LabelObstacle[],
  bounds: { readonly width: number; readonly height: number } | undefined,
  previous: ReadonlyMap<string, LabelPlacement> | undefined,
): { shown: Map<string, LabelPlacement>; boxes: readonly Box[] } {
  const placed: Box[] = [...obstacles]
  const shown = new Map<string, LabelPlacement>()
  // Every disc's box once a frame, not once a label.
  const discBoxes = discs.map((d) => ({ key: d.key, box: discBox(d) }))
  for (const item of items) {
    if (!item.visible) continue
    const width =
      item.widthPx !== undefined && item.widthPx > 0 ? item.widthPx : item.text.length * CHAR_PX
    const boxAt = (dy: number, dx = 0): Box => ({
      l: item.x + dx + OFFSET_X - PAD_X,
      r: item.x + dx + OFFSET_X + width + PAD_X,
      t: item.y + dy - HEIGHT_PX / 2 - PAD,
      b: item.y + dy + HEIGHT_PX / 2 + PAD,
    })
    // A label never avoids its own body's disc.
    const onOtherDisc = (b: Box) =>
      discBoxes.some((d) => (d.key === undefined || d.key !== item.key) && overlaps(b, d.box))
    // A label on a disc steps right, past the disc's edge, before trying its slots.
    let dx = 0
    if (item.avoidDiscs) {
      for (const d of discBoxes) {
        if (d.key !== undefined && d.key === item.key) continue
        if (overlaps(boxAt(0, dx), d.box)) dx = Math.max(dx, d.box.r - item.x - OFFSET_X + PAD_X)
      }
    }
    const blockedNoDots = (b: Box) =>
      (bounds !== undefined && (b.t < 0 || b.b > bounds.height || b.l < 0 || b.r > bounds.width)) ||
      placed.some((p) => overlaps(b, p))
    const blocked = (b: Box) => blockedNoDots(b) || onOtherDisc(b)
    // The left side: the label ends OFFSET_X short of the body's far edge.
    const leftDx = -(2 * (item.reach ?? 0) + 2 * OFFSET_X + width)
    const slotFree = (s: Slot) => !blocked(boxAt(s.dy, s.left ? leftDx : dx))
    // Last frame's slot first, while it is still free, so a label does not flip between
    // slots as the camera moves (#132 review).
    const last = previous?.get(item.key)
    const held: Slot | undefined = last ? { dy: last.dy, left: last.side === 'left' } : undefined
    const free =
      held && slotFree(held)
        ? held
        : (item.priority || item.farRungs ? NEAR_AND_FAR_SLOTS : NEAR_SLOTS).find(slotFree)
    if (free?.left) {
      placed.push(boxAt(free.dy, leftDx))
      shown.set(item.key, { dy: free.dy, dx: leftDx, side: 'left' })
      continue
    }
    // A home label shows anyway, over a dot, rather than hide; the voice subject always.
    const overDots = item.priority
      ? PRIORITY_SLOTS.find((dy) => !blockedNoDots(boxAt(dy, dx)))
      : undefined
    const dy = free?.dy ?? overDots ?? (item.mustShow ? (SLOTS.at(-1) ?? 0) : undefined)
    if (dy === undefined) continue
    placed.push(boxAt(dy, dx))
    shown.set(item.key, dx === 0 ? { dy } : { dy, dx })
  }
  return { shown, boxes: placed.slice(obstacles.length) }
}

/** The inspector's share of the stage, px: a sheet along the bottom on a phone (wider
 *  than 60% of the stage), else a drawer on the right. None when it is closed. */
export function panelInset(
  stage: { readonly width: number; readonly height: number },
  panel: LabelObstacle | null,
): { right: number; bottom: number } {
  if (!panel) return { right: 0, bottom: 0 }
  const sheet = panel.r - panel.l > stage.width * 0.6
  return sheet
    ? { right: 0, bottom: Math.max(0, stage.height - panel.t) }
    : { right: Math.max(0, stage.width - panel.l), bottom: 0 }
}

/**
 * Everything on the stage in one pass (#132), so nothing sits on anything else:
 * 1. Rim markers that fit on the rim itself, around the furniture (badge, guide chip,
 *    buttons, inspector).
 * 2. The labels, around the furniture and those markers.
 * 3. The markers that did not fit, a row or more in from the rim, around all of that.
 *    A label beside its body wins over a marker that had to leave its rim (on a phone
 *    with Jupiter's sheet open, the stepped-in markers had pushed the moons' labels
 *    out); a marker with no room left is not shown (absent from `rim`).
 */
export function layoutStage(input: {
  rim: readonly RimMarker[]
  rimSpan: RimSpan
  labels: readonly LabelCandidate[]
  discs: readonly LabelDisc[]
  furniture: readonly LabelObstacle[]
  bounds: { readonly width: number; readonly height: number }
  /** Last frame's label placements: each label holds its slot while it is free. */
  previous?: ReadonlyMap<string, LabelPlacement> | undefined
}): { rim: Map<string, RimPlace>; labels: Map<string, LabelPlacement> } {
  const onRim = new Map<string, RimPlace>()
  // One list of what is taken, grown as markers land (this runs every drawn frame).
  const taken: Box[] = [...input.furniture]
  for (const m of input.rim) {
    const p = placeRim(m, input.rimSpan, taken, 0, 0)
    if (!p) continue
    onRim.set(m.key, p)
    taken.push(p.box)
  }
  const labels = placeLabels(input.labels, input.discs, taken, input.bounds, input.previous)
  taken.push(...labels.boxes)
  for (const m of input.rim) {
    if (onRim.has(m.key)) continue
    const p = placeRim(m, input.rimSpan, taken, 1, RIM_STEPS_IN)
    if (!p) continue
    onRim.set(m.key, p)
    taken.push(p.box)
  }
  return { rim: onRim, labels: labels.shown }
}
