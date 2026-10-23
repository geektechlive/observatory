import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { subsolarPoint } from '@/lib/solar'

import styles from './lens.module.css'

export interface SubsolarPlateHandle {
  /** Called every frame by the globe; writes to the DOM, never to React state. */
  setFacing: (lon: number) => void
}

const REFRESH_MS = 60_000

function fmt(lat: number, lon: number): string {
  const ns = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`
  const ew = `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`
  return `${ns} ${ew}`
}

function fmtLon(lon: number): string {
  return `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`
}

/**
 * Where the Sun is overhead, and which longitude the globe faces (#63). The facing
 * changes every frame, so it goes straight to a text node through a handle.
 */
export function SubsolarPlate({ ref }: { ref?: Ref<SubsolarPlateHandle> }) {
  const [sub, setSub] = useState(() => subsolarPoint(new Date()))
  const facing = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const id = window.setInterval(() => {
      setSub(subsolarPoint(new Date()))
    }, REFRESH_MS)
    return () => {
      window.clearInterval(id)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    setFacing: (lon: number) => {
      if (facing.current) facing.current.textContent = fmtLon(lon)
    },
  }))

  return (
    <div className={styles.plate ?? ''}>
      <span className={styles.engrave ?? ''}>Sub-solar</span>
      <span className={styles.readout ?? ''}>{fmt(sub.lat, sub.lon)}</span>
      <span className={styles.faint ?? ''}>
        facing <span ref={facing}>—</span>
      </span>
    </div>
  )
}
