import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import styles from './apod-lightbox.module.css'

interface ApodLightboxProps {
  src: string
  alt: string
  onClose: () => void
}

export function ApodLightbox({ src, alt, onClose }: ApodLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
      prev?.focus()
    }
  }, [onClose])

  useEffect(() => {
    closeRef.current?.focus()

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
    }
  }, [])

  return createPortal(
    <div
      ref={dialogRef}
      className={styles.backdrop ?? ''}
      role="dialog"
      aria-modal="true"
      aria-label="Full-size APOD image"
    >
      {/* Backdrop click-to-close is a pointer convenience. Keyboard users close with
          Escape (handled above) or the always-focused close button, so this button
          is hidden from assistive tech rather than duplicated as a keyboard target. */}
      <button
        type="button"
        className={styles.backdropClose ?? ''}
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <img src={src} alt={alt} className={styles.img ?? ''} />
      <button
        ref={closeRef}
        type="button"
        className={styles.close ?? ''}
        aria-label="Close image"
        onClick={onClose}
      >
        ✕
      </button>
    </div>,
    document.body,
  )
}
