import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'

import { distanceReadout } from './distanceText'

/** A distance readout with its other units beside it, in the unit its size reads best in (#217). */
export function Distance({ au, miles = false }: { au: number; miles?: boolean }) {
  const r = distanceReadout(au, { miles })
  return (
    <>
      <Readout value={r.value} unit={r.unit} />
      {r.aside && (
        <>
          {' '}
          <Label>{r.aside}</Label>
        </>
      )}
    </>
  )
}
