import '@/styles/global.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { defaultRetry, defaultRetryDelay } from '@/hooks/useSourceQuery'
import { onRevalidating } from '@/lib/api/client'
import { refetchOnceAfter, revalidateFeeds } from '@/lib/api/revalidate'
import { isOrreryHash, prefetchOrrery, scheduleOrreryIdlePrefetch } from '@/lib/orreryPrefetch'
import { preloadTexturesAtBoot } from '@/lib/texturePreload'

import { App } from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A schema mismatch or a 400 can never succeed on retry, so retrying one
      // costs three extra Worker invocations for nothing. See defaultRetry.
      retry: defaultRetry,
      // 1, 2, 4 s, but 61 s after a 429 or a negative-cache replay (#218).
      retryDelay: defaultRetryDelay,
      refetchOnWindowFocus: true,
      // Background tabs must not keep polling /api/* on a metered free plan.
      refetchIntervalInBackground: false,
    },
  },
})

// An old answer the server is refreshing (#83): ask again once the fresh copy has landed.
// Every active feed refetches; the ones already fresh come back as cache HITs. The JPL
// lookups are left alone (revalidateFeeds, #215).
onRevalidating(
  refetchOnceAfter(() => {
    void revalidateFeeds(queryClient)
  }),
)

// The Earth textures every globe tier draws first (#85, #173), for the views that draw the
// globe and on desktop-size screens only; a phone gets them from GlobeHost after first
// paint (#87). Static links in index.html made a desktop #orrery, #sun or #sky fetch them.
preloadTexturesAtBoot(window.location.hash)

// The orrery's code arrived in two hops, each a round trip (#168). When the address is the
// orrery, ask for all of it now, before React renders; otherwise fetch it once the Earth
// page has loaded and the browser is idle, so the Orrery tab opens without a wait.
if (isOrreryHash(window.location.hash)) {
  void prefetchOrrery()
} else if (document.readyState === 'complete') {
  scheduleOrreryIdlePrefetch()
} else {
  window.addEventListener('load', () => scheduleOrreryIdlePrefetch(), { once: true })
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
