import { DsnPanel } from '@/components/panels/DsnPanel'
import { PeopleInSpacePanel } from '@/components/panels/PeopleInSpacePanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

/** Beside the tracking globe (#63): who is up there and who is listening. */
export function OrbitConsoleLead() {
  return (
    <>
      <ErrorBoundary label="Humans in Orbit">
        <PeopleInSpacePanel />
      </ErrorBoundary>
      <ErrorBoundary label="Deep Space Network">
        <DsnPanel />
      </ErrorBoundary>
    </>
  )
}
