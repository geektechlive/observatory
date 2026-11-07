/**
 * The view the orrery opens on (#123): the whole system, Voyagers included, at the
 * Heliosphere preset's low angle. Kept apart from the three.js layer, like
 * craftFilter.ts, so the page can read it without importing the renderer chunk.
 */
import type { FocusPreset } from './three/framing'

export const DEFAULT_PRESET: FocusPreset = 'heliosphere'
