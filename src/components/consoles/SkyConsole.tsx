import { lazy, Suspense } from 'react'

import { PlanetsPanel } from '@/components/panels/PlanetsPanel'
import { SentryPanel } from '@/components/panels/SentryPanel'
import { SunMoonPanel } from '@/components/panels/SunMoonPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

// Lazy (#78): the sky math is only worth loading once someone opens the Sky console.
const TonightPanel = lazy(() =>
  import('@/components/panels/TonightPanel').then((m) => ({ default: m.TonightPanel })),
)

/** Beside the sky dome (#63): tonight's planets, Sun and Moon, and close approaches. */
export function SkyConsoleLead() {
  return (
    <>
      <ErrorBoundary label="Planets Tonight">
        <PlanetsPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Sun & Moon">
        <SunMoonPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Tonight">
        <Suspense fallback={null}>
          <TonightPanel />
        </Suspense>
      </ErrorBoundary>
      <ErrorBoundary label="Sentry">
        <SentryPanel />
      </ErrorBoundary>
    </>
  )
}
