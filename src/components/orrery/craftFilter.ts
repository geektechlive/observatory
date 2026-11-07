/**
 * Which spacecraft the orrery draws (#93; spec Part 19 groups). Kept apart from the
 * three.js layer so the page can hold the state without importing the renderer chunk.
 */
export interface CraftFilter {
  'deep-space': boolean
  mission: boolean
  l1: boolean
  /** Only craft the Deep Space Network is talking to now. */
  dsnOnly: boolean
}

export const DEFAULT_CRAFT_FILTER: CraftFilter = {
  'deep-space': true,
  mission: true,
  // At the solar-system scale the L1/L2 craft sit inside Earth's marker; the Earth
  // frame (#92) separates them. Off by default so they don't bury Earth's label.
  l1: false,
  dsnOnly: false,
}
