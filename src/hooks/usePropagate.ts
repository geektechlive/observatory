import { useEffect, useState } from 'react'

import { loadedPropagate, loadPropagate, type PropagateModule } from '@/lib/orbit/loadPropagate'

/**
 * SGP4 for a hook, loaded the first time `needed` is true (#97): null until the
 * satellite.js chunk has arrived, then the propagation module.
 */
export function usePropagate(needed: boolean): PropagateModule | null {
  const [mod, setMod] = useState<PropagateModule | null>(loadedPropagate)
  useEffect(() => {
    if (!needed || mod) return
    let live = true
    void loadPropagate().then((m) => {
      if (live) setMod(m)
    })
    return () => {
      live = false
    }
  }, [needed, mod])
  return mod
}
