import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import styles from './apod-lightbox.module.css'

interface ApodLightboxProps {
  src: string
  alt: string
  onClose: () => void
}

export function ApodLightbox({ src, alt, onClose }: ApodLightboxProps) {
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

  return createPortal(
    <div
      className={styles.backdrop ?? ''}
      role="dialog"
      aria-modal="true"
      aria-label="Full-size APOD image"
      onClick={onClose}
    >
      <img src={src} alt={alt} className={styles.img ?? ''} onClick={(e) => e.stopPropagation()} />
      <button
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
