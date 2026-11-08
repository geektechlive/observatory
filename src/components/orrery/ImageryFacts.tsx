import type { BodyName } from '@/lib/orrery/bodies'
import { BODY_IMAGERY, type ColourKind } from '@/lib/orrery/imagery'

import styles from './orrery.module.css'
import type { SunImageState } from './three/sunImage'

const COLOUR_LABEL: Record<ColourKind, string> = {
  true: 'True colour',
  enhanced: 'Enhanced colour',
  simulated: 'Simulated colour',
  shaded: 'Shaded, no map',
  observed: 'Observed',
}

const hm = (d: Date) => d.toISOString().slice(11, 16)

/** What the live Sun shows now, or why it is a flat disc. */
function sunLine(sun: SunImageState | undefined): string {
  if (!sun || sun.kind === 'loading') return 'Loading the live image…'
  if (sun.kind === 'fallback') return `Flat disc: ${sun.reason}`
  const { start, end, satellite } = sun.frame
  return `Observed ${start.toISOString().slice(0, 10)} ${hm(start)}–${hm(end)} UTC by ${satellite} SUVI`
}

/**
 * How honest a body's look is (#105; spec Part 16): the kind of colour, what it means,
 * the mission and the credit. The Sun says when its live frame was observed.
 */
export function ImageryFacts({ body, sun }: { body: BodyName; sun?: SunImageState | undefined }) {
  const img = BODY_IMAGERY[body]
  return (
    <dl className={styles.facts ?? ''}>
      <dt>Imagery</dt>
      {/* One dd per dt: the facts grid pairs them by position. */}
      <dd className={styles.inspectorText ?? ''}>
        <span>{body === 'Sun' ? sunLine(sun) : COLOUR_LABEL[img.colour]}</span>{' '}
        <span className={styles.imageryNote ?? ''}>{img.note}</span>
      </dd>
      <dt>Mission</dt>
      <dd className={styles.inspectorText ?? ''}>{img.mission}</dd>
      <dt>Credit</dt>
      <dd className={styles.inspectorText ?? ''}>
        {img.creditUrl ? (
          <a href={img.creditUrl} target="_blank" rel="noreferrer">
            {img.credit}
          </a>
        ) : (
          img.credit
        )}
      </dd>
    </dl>
  )
}
