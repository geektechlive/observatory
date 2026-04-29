import { StatusBar } from '@/components/status-bar/StatusBar'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { WorldMap } from '@/components/world-map/WorldMap'
import appStyles from './App.module.css'

export function App() {
  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <StatusBar />

      <main id="main-content" className={appStyles.main}>
        <div className={appStyles.grid}>
          <div className={appStyles.mapPlaceholder}>
            <WorldMap />
          </div>

          <GlassPanel variant="tile" label="ISS" className={appStyles.tile}>
            <div className={appStyles.placeholder}>
              <span>ISS Tracker — Phase 2</span>
            </div>
          </GlassPanel>

          <GlassPanel variant="tile" label="Asteroids" className={appStyles.tile}>
            <div className={appStyles.placeholder}>
              <span>NeoWs — Phase 3</span>
            </div>
          </GlassPanel>

          <GlassPanel variant="tile" label="APOD" className={appStyles.tile}>
            <div className={appStyles.placeholder}>
              <span>APOD — Phase 3</span>
            </div>
          </GlassPanel>

          <GlassPanel variant="tile" label="Space Weather" className={appStyles.tile}>
            <div className={appStyles.placeholder}>
              <span>DONKI — Phase 3</span>
            </div>
          </GlassPanel>
        </div>

        <div className={appStyles.ticker}>
          <GlassPanel variant="tile" className={appStyles.tickerInner}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--ink-dim)',
                padding: '0 16px',
              }}
            >
              ● Live Ticker — Phase 3
            </span>
          </GlassPanel>
        </div>
      </main>
    </>
  )
}
