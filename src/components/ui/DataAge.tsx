import { useEffect, useState } from 'react'
import styles from './data-age.module.css'

interface DataAgeProps {
  updatedAt: number
}

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

export function DataAge({ updatedAt }: DataAgeProps) {
  const [label, setLabel] = useState(() => formatAge(Date.now() - updatedAt))

  useEffect(() => {
    const tick = () => setLabel(formatAge(Date.now() - updatedAt))
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [updatedAt])

  if (updatedAt === 0) return null

  return (
    <span className={styles.age ?? ''} title={new Date(updatedAt).toLocaleTimeString()}>
      {label}
    </span>
  )
}
