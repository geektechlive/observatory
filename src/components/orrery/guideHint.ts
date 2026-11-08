/**
 * Whether this visitor has met the guide yet (#159). The "New here?" chip shows until they
 * open the guide or dismiss it, and the answer is kept in localStorage so it is not shown on
 * every visit. Storage can be missing or blocked (private mode, a policy, a full disk, or a
 * `localStorage` getter that throws): every access is wrapped, and the answer is also kept
 * in memory so a dismissal still holds for the rest of the session.
 */
export const GUIDE_STORAGE_KEY = 'observatory.orrery.guide.v1'

let seenInMemory = false

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** True once the visitor has opened or dismissed the guide, on this or an earlier visit. */
export function guideSeen(): boolean {
  if (seenInMemory) return true
  try {
    const raw = storage()?.getItem(GUIDE_STORAGE_KEY) ?? null
    if (raw === null) return false
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && 'seen' in parsed && parsed.seen === true
  } catch {
    return false
  }
}

export function markGuideSeen(): void {
  seenInMemory = true
  try {
    storage()?.setItem(GUIDE_STORAGE_KEY, JSON.stringify({ seen: true }))
  } catch {
    // Blocked or full: the in-memory flag still covers this session.
  }
}

/** Test seam: forget the in-memory flag, as a fresh page load would. */
export function resetGuideSeenForTests(): void {
  seenInMemory = false
}
