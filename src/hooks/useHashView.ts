import { useEffect } from 'react'
import { useUiStore, CONSOLE_VIEWS, type ConsoleView } from '@/store/ui'

function parseHash(): ConsoleView | null {
  const raw = window.location.hash.replace(/^#\/?/, '').toLowerCase()
  return (CONSOLE_VIEWS as string[]).includes(raw) ? (raw as ConsoleView) : null
}

/**
 * Syncs the active console with the URL hash so views are shareable/bookmarkable
 * (`#sun`). Hash → store on load + hashchange; store → hash on selection.
 */
export function useHashView(): void {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)

  // Initialize from the hash on first mount.
  useEffect(() => {
    const fromHash = parseHash()
    if (fromHash) setView(fromHash)
    else window.history.replaceState(null, '', `#${view}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Respond to back/forward and manual hash edits.
  useEffect(() => {
    const onHashChange = () => {
      const fromHash = parseHash()
      if (fromHash) setView(fromHash)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [setView])

  // Reflect store changes back into the hash.
  useEffect(() => {
    if (parseHash() !== view) window.history.replaceState(null, '', `#${view}`)
  }, [view])
}
