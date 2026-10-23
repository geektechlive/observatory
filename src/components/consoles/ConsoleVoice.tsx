import { useLaunches } from '@/hooks/useLaunches'
import { useNeo } from '@/hooks/useNeo'
import { useNow } from '@/hooks/useNow'
import { usePeopleInSpace } from '@/hooks/usePeopleInSpace'
import { useQuakes } from '@/hooks/useQuakes'
import { useSolarActivity } from '@/hooks/useSolarActivity'
import { useSolarWind } from '@/hooks/useSolarWind'
import { useSunMoon } from '@/hooks/useSunMoon'
import { type Feed, toFeed, voiceFor, type VoiceInput, type VoiceView } from '@/lib/voice'
import type { ConsoleView } from '@/store/ui'

import styles from './console.module.css'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

const LOADING: Feed<never> = { state: 'loading' }
const EMPTY: VoiceInput = {
  quakes: LOADING,
  kp: LOADING,
  xray: LOADING,
  wind: LOADING,
  moon: LOADING,
  neo: LOADING,
  people: LOADING,
  launch: LOADING,
}

function Line({ view, input }: { view: VoiceView; input: VoiceInput }) {
  return <p className={styles.voice ?? ''}>{voiceFor(view, input)}</p>
}

// One small component per console, so only that console's feeds are read.

function EarthVoice() {
  const quakes = useQuakes()
  const wind = useSolarWind()
  const now = useNow(60_000).getTime()
  return (
    <Line
      view="earth"
      input={{
        ...EMPTY,
        quakes: toFeed(quakes, (d) =>
          d.quakes
            .filter((q) => now - q.time <= DAY_MS)
            .map((q) => ({ mag: q.mag, place: q.place })),
        ),
        kp: toFeed(wind, (d) => ({ value: d.currentKp })),
      }}
    />
  )
}

function SunVoice() {
  const activity = useSolarActivity()
  const wind = useSolarWind()
  return (
    <Line
      view="sun"
      input={{
        ...EMPTY,
        // The X-ray feed covers 6 hours, so there is no honest 24 h peak to report.
        xray: toFeed(activity, (d) => ({ currentClass: d.xray.currentClass, peakClass24h: null })),
        wind: toFeed(wind, (d) => ({ speedKmS: d.windSpeed })),
        kp: toFeed(wind, (d) => ({ value: d.currentKp })),
      }}
    />
  )
}

function SkyVoice() {
  const sunMoon = useSunMoon()
  const neo = useNeo()
  return (
    <Line
      view="sky"
      input={{
        ...EMPTY,
        moon: toFeed(sunMoon, (d) => ({ phase: d.curPhase, illuminationPct: d.fracIllum })),
        neo: toFeed(neo, (d) => ({ countThisWeek: d.element_count })),
      }}
    />
  )
}

function OrbitVoice() {
  const people = usePeopleInSpace()
  const launches = useLaunches()
  const now = useNow(60_000).getTime()
  return (
    <Line
      view="orbit"
      input={{
        ...EMPTY,
        people: toFeed(people, (d) => ({ count: d.number })),
        launch: toFeed(launches, (d) => {
          const next = d.result[0]
          const at = Date.parse(next?.t0 ?? next?.win_open ?? '')
          return {
            name: next?.name ?? null,
            hoursUntil: Number.isFinite(at) ? (at - now) / HOUR_MS : null,
          }
        }),
      }}
    />
  )
}

const VOICES: Record<ConsoleView, () => React.JSX.Element> = {
  earth: EarthVoice,
  sun: SunVoice,
  sky: SkyVoice,
  orbit: OrbitVoice,
}

/** The console's one Fraunces sentence (tokens rule 7), written from live data. */
export function ConsoleVoice({ view }: { view: ConsoleView }) {
  const Voice = VOICES[view]
  return <Voice />
}
