import { useEffect } from 'react'

import { VIEW_META } from '@/lib/viewMeta'
import { useUiStore } from '@/store/ui'

/** The tab title follows the view on screen (ADR 0036), as its static shell's `<title>` does. */
export function useViewTitle(): void {
  const view = useUiStore((s) => s.view)
  useEffect(() => {
    document.title = VIEW_META[view].title
  }, [view])
}
