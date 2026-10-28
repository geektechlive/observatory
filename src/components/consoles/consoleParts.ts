import { type ComponentType, lazy } from 'react'

import type { ConsoleView } from '@/store/ui'

import { EarthConsoleLead } from './EarthConsole'
import { OrbitConsoleLead } from './OrbitConsole'
import { SkyConsoleLead } from './SkyConsole'
import { SunConsoleLead } from './SunConsole'

// The Rest panels sit below the lens row, so each console's set loads in its own chunk
// after first paint (#75). The entry chunk had 2.9 kB left under its 190 kB budget.
const EarthConsoleRest = lazy(() =>
  import('./EarthConsoleRest').then((m) => ({ default: m.EarthConsoleRest })),
)
const SunConsoleRest = lazy(() =>
  import('./SunConsoleRest').then((m) => ({ default: m.SunConsoleRest })),
)
const SkyConsoleRest = lazy(() =>
  import('./SkyConsoleRest').then((m) => ({ default: m.SkyConsoleRest })),
)
const OrbitConsoleRest = lazy(() =>
  import('./OrbitConsoleRest').then((m) => ({ default: m.OrbitConsoleRest })),
)

export interface ConsoleParts {
  /** The mono line under the voice sentence. */
  sub: string
  /** Panels in the column beside the lens. */
  Lead: ComponentType
  /** Panels in the grid below the lens row; lazy, so render it inside Suspense. */
  Rest: ComponentType
}

export const CONSOLE_PARTS: Record<ConsoleView, ConsoleParts> = {
  earth: {
    sub: 'Hazards and systems · toggle live layers on the globe',
    Lead: EarthConsoleLead,
    Rest: EarthConsoleRest,
  },
  sun: {
    sub: 'Heliophysics · space weather · forecast',
    Lead: SunConsoleLead,
    Rest: SunConsoleRest,
  },
  sky: {
    sub: 'Planets · deep space · near-Earth objects',
    Lead: SkyConsoleLead,
    Rest: SkyConsoleRest,
  },
  orbit: {
    sub: 'Launches · crews · deep-space comms',
    Lead: OrbitConsoleLead,
    Rest: OrbitConsoleRest,
  },
}
