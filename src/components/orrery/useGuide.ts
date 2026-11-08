import { type RefObject, useCallback, useRef, useState } from 'react'

import type { ShownLesson } from './guide/OrreryGuide'
import { guideSeen, markGuideSeen } from './guideHint'
import type { OrreryLink } from './orreryLink'
import type { ApplyLinkOptions } from './useOrreryLink'

export type GuideMode = 'closed' | 'open' | 'compact'

interface GuideState {
  mode: GuideMode
  shown: ShownLesson | null
}

/**
 * The guide drawer's state on the orrery page (#159): closed, open, or collapsed to a bar
 * while a lesson is on show. The drawer's code is a lazy chunk (guide/OrreryGuide.tsx);
 * this hook, which only holds the state and the first-visit chip, is in the page's chunk.
 * Closing returns focus to whatever opened the guide, or to a Guide button.
 */
export function useGuide(
  applyLink: (link: OrreryLink, opts?: ApplyLinkOptions) => void,
  fallbackFocus: readonly RefObject<HTMLElement | null>[],
) {
  const [state, setState] = useState<GuideState>({ mode: 'closed', shown: null })
  const [chipVisible, setChipVisible] = useState(() => !guideSeen())
  const opener = useRef<HTMLElement | null>(null)

  const open = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    markGuideSeen()
    setChipVisible(false)
    setState((s) => ({ ...s, mode: 'open' }))
  }, [])

  const close = useCallback(() => {
    setState({ mode: 'closed', shown: null })
    const back = opener.current?.isConnected ? opener.current : null
    // The chip is gone once pressed, and the rail's button is hidden on a phone: use
    // whichever Guide button is on screen.
    const visible = fallbackFocus.map((r) => r.current).find((el) => el && el.offsetParent !== null)
    ;(back ?? visible)?.focus()
  }, [fallbackFocus])

  const expand = useCallback(() => {
    setState((s) => ({ ...s, mode: 'open' }))
  }, [])

  const show = useCallback(
    (lesson: ShownLesson, link: OrreryLink) => {
      setState({ mode: 'compact', shown: lesson })
      applyLink(link, { fresh: true })
    },
    [applyLink],
  )

  const dismissChip = useCallback(() => {
    markGuideSeen()
    setChipVisible(false)
  }, [])

  return { ...state, chipVisible, open, close, expand, show, dismissChip }
}
