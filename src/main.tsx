import '@/styles/global.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { defaultRetry } from '@/hooks/useSourceQuery'
import { onRevalidating } from '@/lib/api/client'
import { refetchOnceAfter } from '@/lib/api/revalidate'

import { App } from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A schema mismatch or a 400 can never succeed on retry, so retrying one
      // costs three extra Worker invocations for nothing. See defaultRetry.
      retry: defaultRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      refetchOnWindowFocus: true,
      // Background tabs must not keep polling /api/* on a metered free plan.
      refetchIntervalInBackground: false,
    },
  },
})

// An old answer the server is refreshing (#83): ask again once the fresh copy has landed.
// Every active query refetches; the ones already fresh come back as cache HITs.
onRevalidating(
  refetchOnceAfter(() => {
    void queryClient.invalidateQueries({ refetchType: 'active' })
  }),
)

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
