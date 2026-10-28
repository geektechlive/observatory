import { PlanetsPanel } from '@/components/panels/PlanetsPanel'
import { SentryPanel } from '@/components/panels/SentryPanel'
import { SunMoonPanel } from '@/components/panels/SunMoonPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

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
      <ErrorBoundary label="Sentry">
        <SentryPanel />
      </ErrorBoundary>
    </>
  )
}
