import { useEffect, useState } from 'react'

function readVisibility(): boolean {
  if (typeof document === 'undefined') return true
  return document.visibilityState !== 'hidden'
}

/**
 * Tracks tab visibility so pollers can stand down on a backgrounded tab.
 * Safe under jsdom, where `visibilityState` is always 'visible'.
 */
export function useVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(readVisibility)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onChange = () => {
      setVisible(readVisibility())
    }
    document.addEventListener('visibilitychange', onChange)
    return () => {
      document.removeEventListener('visibilitychange', onChange)
    }
  }, [])

  return visible
}
