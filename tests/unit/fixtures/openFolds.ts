import { FOLDS_STORAGE_KEY, resetFoldMemory } from '@/components/orrery/railFolds'

/**
 * Start every folding rail group open (#273), as a visitor who opened them all would see
 * it, so a test about what a group holds needn't open it first.
 */
export function openAllFolds(): void {
  resetFoldMemory()
  localStorage.setItem(
    FOLDS_STORAGE_KEY,
    JSON.stringify({ solar: true, craft: true, small: true, near: true, orbit: true }),
  )
}
