import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The larger view (#89). A CSS full-screen lens rather than the Fullscreen API, which
 * iPhone Safari lacks for anything but video. While expanded, the page can't scroll
 * under it; Esc returns, and focus goes back to the button that opened it.
 * The caller marks the app's own content outside the lens `inert`; this marks the
 * rest of the document.
 */
export function useLensExpand() {
  const [expanded, setExpanded] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const toggle = useCallback(() => {
    setExpanded((e) => !e)
  }, [])

  useEffect(() => {
    if (!expanded) return
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', onKey)
    const button = buttonRef.current
    // Outside the app root (the skip link in index.html), nothing is in React's reach.
    const others = [...document.body.children].filter(
      (el) => !el.contains(button) && !el.hasAttribute('inert'),
    )
    for (const el of others) el.setAttribute('inert', '')
    return () => {
      for (const el of others) el.removeAttribute('inert')
      document.removeEventListener('keydown', onKey)
      root.style.overflow = before
      button?.focus()
    }
  }, [expanded])

  return { expanded, toggle, buttonRef }
}
