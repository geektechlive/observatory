import '@/styles/global.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { defaultRetry } from '@/hooks/useSourceQuery'

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

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
