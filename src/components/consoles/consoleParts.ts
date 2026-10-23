import type { ComponentType } from 'react'

import type { ConsoleView } from '@/store/ui'

import { EarthConsoleLead, EarthConsoleRest } from './EarthConsole'
import { OrbitConsoleLead, OrbitConsoleRest } from './OrbitConsole'
import { SkyConsoleLead, SkyConsoleRest } from './SkyConsole'
import { SunConsoleLead, SunConsoleRest } from './SunConsole'

export interface ConsoleParts {
  /** The mono line under the voice sentence. */
  sub: string
  /** Panels in the column beside the lens. */
  Lead: ComponentType
  /** Panels in the grid below the lens row. */
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
