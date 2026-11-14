import { useState } from 'react'

import { Label } from '@/components/ui/Label'
import { useOrreryClock } from '@/store/orreryClock'

import { parseSimDate, toDateField } from './simDate'
import { useSimTime } from './useSimTime'

/**
 * "Go to date": jump the clock to a YYYY-MM-DD (negative years are BC). The time bar shows
 * it on wide screens; on a phone the bar has no room, so the Controls sheet shows it (#242).
 */
export function GoToDate({ className }: { className?: string | undefined }) {
  const setSimTime = useOrreryClock((s) => s.setSimTime)
  const { sim } = useSimTime()
  const [field, setField] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)

  const commit = () => {
    if (field === null) return
    const ms = parseSimDate(field)
    if (ms === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setField(null)
    setSimTime(ms)
  }

  return (
    <label className={className ?? ''}>
      <Label>Go to date</Label>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Go to date (YYYY-MM-DD; negative years are BC)"
        aria-invalid={invalid}
        placeholder="YYYY-MM-DD"
        value={field ?? toDateField(sim)}
        onChange={(e) => {
          setField(e.target.value)
          setInvalid(false)
        }}
        onBlur={() => {
          setField(null)
          setInvalid(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
    </label>
  )
}
