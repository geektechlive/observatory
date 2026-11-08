import { Readout } from '@/components/ui/Readout'
import { discosSize } from '@/lib/satcatWords'
import type { DiscosObject } from '@/schemas/spaceTrack'

import styles from './orrery.module.css'

const KG_TO_LB = 2.20462

/**
 * ESA DISCOS's physical facts for a craft or satellite (#101), as rows of the
 * inspector's facts list: mass, size, operator, and the credit.
 */
export function DiscosFacts({ object }: { object: DiscosObject }) {
  const size = discosSize(object)
  return (
    <>
      {object.massKg !== null && (
        <>
          <dt>Mass</dt>
          <dd>
            <Readout value={Math.round(object.massKg).toLocaleString('en-US')} unit="kg" />{' '}
            <span className={styles.inspectorText ?? ''}>
              {`${Math.round(object.massKg * KG_TO_LB).toLocaleString('en-US')} lb`}
            </span>
          </dd>
        </>
      )}
      {size && (
        <>
          <dt>Size</dt>
          <dd className={styles.inspectorText ?? ''}>{size}</dd>
        </>
      )}
      {object.operators.length > 0 && (
        <>
          <dt>Operator</dt>
          <dd className={styles.inspectorText ?? ''}>{object.operators.join(', ')}</dd>
        </>
      )}
      <dt>Physical data</dt>
      <dd className={styles.inspectorText ?? ''}>{`ESA DISCOS: ${object.name}`}</dd>
    </>
  )
}
