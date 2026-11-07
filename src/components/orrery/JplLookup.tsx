import { useState } from 'react'

import { useJplLookup, useJplTrajectory } from '@/hooks/useJplLookup'
import { trajectoryFacts, type Unavailable } from '@/lib/api/jplLookup'
import type { LookupObject } from '@/schemas/jplLookup'

import styles from './jpl-lookup.module.css'
import { useSimTime } from './useSimTime'

// The orrery search's answer for a name the orrery doesn't carry (#100): what JPL's
// Small-Body Database says, and where Horizons puts the object at the sim date. Loaded
// only when a visitor asks, so it costs the orrery's first load nothing.

const UNIX_EPOCH_JD = 2440587.5
const DAY_MS = 86_400_000
/** SBDB can match hundreds; the card lists the first few. */
const MAX_MATCHES = 10

const UNAVAILABLE: Record<Unavailable, string> = {
  'not-set-up': 'On-demand lookup isn’t available yet.',
  busy: 'JPL is busy right now. Try again in a minute.',
  failed: 'The JPL lookup didn’t work this time.',
  'out-of-range': 'JPL positions are asked for 1900 to 2100 only.',
}

const fmt = (n: number, digits: number) => n.toFixed(digits)

function Position({ object }: { object: LookupObject }) {
  const { sim } = useSimTime(1000)
  const jd = sim / DAY_MS + UNIX_EPOCH_JD
  const traj = useJplTrajectory(object.id, jd)
  if (traj.isPending) return <p className={styles.muted ?? ''}>Asking JPL Horizons where it is…</p>
  const answer = traj.data
  if (answer?.state !== 'ok') {
    return <p className={styles.muted ?? ''}>{UNAVAILABLE[answer?.reason ?? 'failed']}</p>
  }
  const facts = trajectoryFacts(answer.data, jd)
  if (!facts)
    return <p className={styles.muted ?? ''}>JPL Horizons has no position for this date.</p>
  const day = new Date((facts.sampleJd - UNIX_EPOCH_JD) * DAY_MS).toISOString().slice(0, 10)
  return (
    <p className={styles.facts ?? ''}>
      On {day}: {fmt(facts.sunAu, 3)} au from the Sun, about {fmt(facts.earthAu, 3)} au from Earth,
      moving at {fmt(facts.speedKmS, 1)} km/s.
    </p>
  )
}

function ObjectCard({ object }: { object: LookupObject }) {
  const kind = object.kind === 'comet' ? 'Comet' : 'Asteroid'
  return (
    <>
      <h3 className={styles.name ?? ''}>{object.name}</h3>
      <p className={styles.kind ?? ''}>
        {kind}
        {object.orbitClass ? ` · ${object.orbitClass.name}` : ''}
      </p>
      {(object.neo || object.pha) && (
        <p className={styles.flags ?? ''}>
          {object.neo && <span>Near-Earth object</span>}
          {object.pha && <span data-hazard="true">Potentially hazardous</span>}
        </p>
      )}
      <Position object={object} />
      <p className={styles.muted ?? ''}>
        Not drawn in the 3D scene yet: the orrery draws only the objects it loads ahead.
      </p>
    </>
  )
}

export default function JplLookup({ query, onClose }: { query: string; onClose: () => void }) {
  const [q, setQ] = useState(query)
  const lookup = useJplLookup(q)
  const answer = lookup.data

  let body
  if (lookup.isPending) {
    body = <p className={styles.muted ?? ''}>Asking JPL…</p>
  } else if (answer?.state !== 'ok') {
    body = <p className={styles.muted ?? ''}>{UNAVAILABLE[answer?.reason ?? 'failed']}</p>
  } else if (answer.data.result.type === 'object') {
    body = <ObjectCard object={answer.data.result.object} />
  } else if (answer.data.result.type === 'list') {
    const { count, matches } = answer.data.result
    const shown = matches.slice(0, MAX_MATCHES)
    body = (
      <>
        <p className={styles.muted ?? ''}>
          JPL has {count} matches{count > shown.length ? `; the first ${String(shown.length)}` : ''}
          :
        </p>
        <ul className={styles.matches ?? ''}>
          {shown.map((m) => (
            <li key={m.designation}>
              <button
                type="button"
                className={styles.match ?? ''}
                onClick={() => {
                  setQ(m.designation)
                }}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      </>
    )
  } else {
    body = <p className={styles.muted ?? ''}>JPL’s small-body database has nothing called “{q}”.</p>
  }

  return (
    <section aria-label="JPL lookup" className={styles.card ?? ''}>
      <header className={styles.head ?? ''}>
        <span className={styles.kicker ?? ''}>JPL lookup</span>
        <button type="button" className={styles.close ?? ''} onClick={onClose}>
          Close
        </button>
      </header>
      {body}
      <p className={styles.source ?? ''}>JPL Small-Body Database and Horizons, asked on demand</p>
    </section>
  )
}
