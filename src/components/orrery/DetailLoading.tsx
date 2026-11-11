import { useEffect } from 'react'

import styles from './orrery.module.css'

/**
 * Stands in for the detail view while its chunk loads (#203): Escape leaves it, as it does
 * the view itself. It carries a different marker than the view (`data-detail-loading`),
 * so the view's code stays out of the page's chunk (scripts/check-bundle.mjs).
 */
export function DetailLoading({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div className={styles.detailLoading ?? ''} data-detail-loading="" role="status">
      Loading the model view…
    </div>
  )
}
