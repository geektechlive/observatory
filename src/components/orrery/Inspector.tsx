import { type Ref, useId } from 'react'

import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import type { DsnLink } from '@/lib/dsn'
import { AU_KM, formatLightTime, jdFromDate, KM_TO_MI, PLANETS } from '@/lib/orrery'
import { shortName } from '@/lib/orrery/asteroids'
import { type BodyName, describePlanet, ORRERY_BODIES } from '@/lib/orrery/bodies'
import { isLookupKey } from '@/lib/orrery/lookupTrack'
import type { MoonBody } from '@/lib/orrery/moonState'
import { isSatKey } from '@/lib/orrery/satView'
import type { SatcatEntry } from '@/lib/spacetrack'
import type { OrreryTrack } from '@/schemas/orreryBodies'
import type { OrreryNeo } from '@/schemas/orreryNeo'
import type { Discos, Reentry } from '@/schemas/spaceTrack'

import { L1_KEY } from './catalog'
import { CraftFacts } from './CraftFacts'
import { ImageryFacts } from './ImageryFacts'
import { LookupFacts } from './LookupFacts'
import { MoonFacts } from './MoonFacts'
import { AsteroidFacts, type L1Cme, L1Facts, type L1Wind, ScoutFacts } from './NearFacts'
import styles from './orrery.module.css'
import { SatFacts } from './SatFacts'
import { formatSimUtc } from './simDate'
import { Term } from './Term'
import type { SatInfo } from './three/OrreryRenderer'
import type { SunImageState } from './three/sunImage'
import type { LookupView } from './useLookupTrack'

/** The "Look closer" button (#203): the page passes it only for an object with a model. */
export interface LookCloser {
  onOpen: () => void
  /** The detail view is open on this object. */
  open: boolean
  /** The id of the view the button opens, while it exists (aria-controls). */
  controls?: string | undefined
}

function LookCloserButton({
  lookCloser,
  buttonRef,
}: {
  lookCloser: LookCloser | undefined
  buttonRef: Ref<HTMLButtonElement> | undefined
}) {
  if (!lookCloser) return null
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`${styles.chipBtn ?? ''} ${styles.lookCloser ?? ''}`}
      aria-expanded={lookCloser.open}
      aria-controls={lookCloser.controls}
      onClick={lookCloser.onOpen}
    >
      Look closer
    </button>
  )
}

/**
 * The "Facts" toggle (#205): while Look closer is open on a phone, the sheet folds to its
 * header row and this button opens it. The page passes it only while the view is open; the
 * button shows only under 900px.
 */
export interface FactsToggle {
  /** The facts are showing (the sheet is expanded). */
  open: boolean
  onToggle: () => void
}

const factsState = (facts: FactsToggle | undefined) =>
  facts ? (facts.open ? 'open' : 'collapsed') : undefined

function FactsButton({
  facts,
  controls,
}: {
  facts: FactsToggle | undefined
  /** The id of the region the button folds: the sheet's body, under the header row. */
  controls: string
}) {
  if (!facts) return null
  return (
    <button
      type="button"
      className={`${styles.chipBtn ?? ''} ${styles.factsToggle ?? ''}`}
      aria-expanded={facts.open}
      aria-controls={controls}
      onClick={facts.onToggle}
    >
      Facts
    </button>
  )
}

interface InspectorProps {
  /** The page measures the drawer to keep the focused body out from under it. */
  ref?: Ref<HTMLElement> | undefined
  /** A planet's name, 'Sun', or a craft or Moon id (`naif:-31`). */
  body: string
  simMs: number
  onClose: () => void
  /** Craft, Earth and Moon from /api/orrery-bodies (#93). */
  tracks?: readonly OrreryTrack[] | undefined
  /** Craft DSN is talking to now, by NAIF id. */
  dsn?: ReadonlyMap<string, DsnLink> | undefined
  /** The live Sun image's state (#105). */
  sun?: SunImageState | undefined
  /** Drawn moons (#107), Earth's Moon among them. */
  moons?: readonly MoonBody[] | undefined
  /** Close approaches, Scout and ESA (#92). */
  neo?: OrreryNeo | null | undefined
  /** The solar wind at L1 and the CME forecast, for the L1 marker (#92). */
  wind?: L1Wind | null | undefined
  cme?: L1Cme | null | undefined
  /** The chosen satellite's details (#98), or null while its group loads. */
  satellite?: SatInfo | null | undefined
  /** An object looked up at JPL and shown (#145), and how to remove it. */
  lookup?: LookupView | undefined
  onRemoveLookup?: (() => void) | undefined
  /** ESA DISCOS facts for craft and some satellites (#101). */
  discos?: Discos | null | undefined
  /** Space-Track's re-entry predictions (#101). */
  reentries?: readonly Reentry[] | undefined
  /** The chosen satellite's Space-Track catalogue entry, once its shard loads (#101). */
  satCatalog?: SatcatEntry | null | undefined
  /** Present when this object has a 3D model to look at (#203). */
  lookCloser?: LookCloser | undefined
  /** The button's ref, so the page can return focus to it when the view closes. */
  lookCloserRef?: Ref<HTMLButtonElement> | undefined
  /** Present while the detail view is open: the phone sheet folds and this opens it (#205). */
  facts?: FactsToggle | undefined
}

const BODY_NAMES = new Set<string>(['Sun', ...PLANETS])
const isBodyName = (key: string): key is BodyName => BODY_NAMES.has(key)

const fmtAu = (au: number) => (au < 10 ? au.toFixed(3) : au.toFixed(2))
const fmtKm = (km: number) =>
  km >= 1e9 ? `${(km / 1e9).toFixed(2)} billion` : `${(km / 1e6).toFixed(1)} million`

/**
 * What the orrery knows about the selected body (#91; spec Parts 10 and 16). Concise
 * first, with the state vector behind a disclosure. Planet positions are a model
 * (JPL's approximate elements), and the panel says so.
 */
export function Inspector({
  ref,
  body,
  simMs,
  onClose,
  tracks,
  dsn,
  sun,
  moons,
  neo,
  wind,
  cme,
  satellite,
  lookup,
  onRemoveLookup,
  discos,
  reentries,
  satCatalog,
  lookCloser,
  lookCloserRef,
  facts,
}: InspectorProps) {
  const headingId = useId()
  const bodyId = useId()
  if (isLookupKey(body)) {
    return (
      <aside
        ref={ref}
        className={styles.inspector ?? ''}
        aria-labelledby={headingId}
        data-facts={factsState(facts)}
      >
        <div className={styles.inspectorHead ?? ''}>
          <h2 id={headingId} className={styles.inspectorTitle ?? ''}>
            {lookup?.object?.name ?? 'Looked up at JPL'}
          </h2>
          <FactsButton facts={facts} controls={bodyId} />
          <button type="button" className={styles.chipBtn ?? ''} onClick={onClose}>
            Close
          </button>
        </div>
        <div id={bodyId} className={styles.inspectorBody ?? ''}>
          <LookupFacts
            object={lookup?.object ?? null}
            trajectory={lookup?.trajectory ?? null}
            earth={tracks?.find((t) => t.naifId === '399') ?? null}
            simMs={simMs}
            problem={lookup?.problem ?? null}
            loading={lookup?.loading ?? false}
            onRemove={onRemoveLookup ?? onClose}
          />
        </div>
      </aside>
    )
  }
  if (isSatKey(body)) {
    return (
      <aside
        ref={ref}
        className={styles.inspector ?? ''}
        aria-labelledby={headingId}
        data-facts={factsState(facts)}
      >
        <div className={styles.inspectorHead ?? ''}>
          <h2 id={headingId} className={styles.inspectorTitle ?? ''}>
            {satellite?.name ?? 'Satellite'}
          </h2>
          <FactsButton facts={facts} controls={bodyId} />
          <button type="button" className={styles.chipBtn ?? ''} onClick={onClose}>
            Close
          </button>
        </div>
        <div id={bodyId} className={styles.inspectorBody ?? ''}>
          <LookCloserButton lookCloser={lookCloser} buttonRef={lookCloserRef} />
          {satellite ? (
            <SatFacts
              info={satellite}
              simMs={simMs}
              catalog={satCatalog}
              physical={discos?.satellites[satellite.noradId] ?? null}
              reentry={reentries?.find((r) => r.noradId === satellite.noradId) ?? null}
            />
          ) : (
            <p className={styles.inspectorText ?? ''} role="status">
              Loading its orbit data from CelesTrak…
            </p>
          )}
        </div>
      </aside>
    )
  }
  const jd = jdFromDate(new Date(simMs))
  const earthTrack = tracks?.find((t) => t.naifId === '399') ?? null
  const approach = neo?.approaches.find((a) => a.id === body)
  const scout = body.startsWith('scout:')
    ? neo?.scout?.objects.find((o) => `scout:${o.objectName}` === body)
    : undefined
  const near =
    body === L1_KEY ? (
      <L1Facts wind={wind ?? null} cme={cme ?? null} />
    ) : approach && neo ? (
      <AsteroidFacts approach={approach} neo={neo} earth={earthTrack} jd={jd} simMs={simMs} />
    ) : scout ? (
      <ScoutFacts object={scout} />
    ) : null
  const nearTitle =
    body === L1_KEY ? 'L1' : approach ? shortName(approach.name) : scout ? scout.objectName : null
  if (near) {
    return (
      <aside
        ref={ref}
        className={styles.inspector ?? ''}
        aria-labelledby={headingId}
        data-facts={factsState(facts)}
      >
        <div className={styles.inspectorHead ?? ''}>
          <h2 id={headingId} className={styles.inspectorTitle ?? ''}>
            {nearTitle}
          </h2>
          <FactsButton facts={facts} controls={bodyId} />
          <button type="button" className={styles.chipBtn ?? ''} onClick={onClose}>
            Close
          </button>
        </div>
        <div id={bodyId} className={styles.inspectorBody ?? ''}>
          {near}
        </div>
      </aside>
    )
  }
  if (!isBodyName(body)) {
    const moon = moons?.find((m) => m.key === body)
    const track = tracks?.find((t) => t.id === body)
    return (
      <aside
        ref={ref}
        className={styles.inspector ?? ''}
        aria-labelledby={headingId}
        data-facts={factsState(facts)}
      >
        <div className={styles.inspectorHead ?? ''}>
          <h2 id={headingId} className={styles.inspectorTitle ?? ''}>
            {moon?.name ?? track?.name ?? body}
          </h2>
          <FactsButton facts={facts} controls={bodyId} />
          <button type="button" className={styles.chipBtn ?? ''} onClick={onClose}>
            Close
          </button>
        </div>
        <div id={bodyId} className={styles.inspectorBody ?? ''}>
          {track && !moon && <LookCloserButton lookCloser={lookCloser} buttonRef={lookCloserRef} />}
          {moon ? (
            <MoonFacts moon={moon} jd={jd} simMs={simMs} />
          ) : track ? (
            <CraftFacts
              track={track}
              earth={earthTrack}
              jd={jd}
              simMs={simMs}
              link={dsn?.get(track.naifId)}
              physical={discos?.craft[track.naifId] ?? null}
            />
          ) : (
            <p className={styles.inspectorText ?? ''}>Not in the current data.</p>
          )}
        </div>
      </aside>
    )
  }
  const object = ORRERY_BODIES.find((b) => b.name === body)?.object

  return (
    <aside
      ref={ref}
      className={styles.inspector ?? ''}
      aria-labelledby={headingId}
      data-facts={factsState(facts)}
    >
      <div className={styles.inspectorHead ?? ''}>
        <h2 id={headingId} className={styles.inspectorTitle ?? ''}>
          {body}
        </h2>
        <FactsButton facts={facts} controls={bodyId} />
        <button type="button" className={styles.chipBtn ?? ''} onClick={onClose}>
          Close
        </button>
      </div>
      <div id={bodyId} className={styles.inspectorBody ?? ''}>
        <p className={styles.inspectorMeta ?? ''}>
          <Label>{object?.category === 'star' ? 'Star' : 'Planet'}</Label>{' '}
          <Label>{object?.id ?? ''}</Label>
        </p>
        {body === 'Sun' ? (
          <p className={styles.inspectorText ?? ''}>
            The origin of this view: positions are heliocentric, measured from the Sun’s centre (the
            outer planets from the solar-system barycentre, within 0.01 au of it).
          </p>
        ) : (
          <PlanetFacts body={body} jd={jd} simMs={simMs} />
        )}
        <ImageryFacts body={body} sun={sun} />
      </div>
    </aside>
  )
}

function PlanetFacts({
  body,
  jd,
  simMs,
}: {
  body: Exclude<BodyName, 'Sun'>
  jd: number
  simMs: number
}) {
  const d = describePlanet(body, jd)
  const { state } = d
  const earthKm = d.earthDistanceAu === null ? null : d.earthDistanceAu * AU_KM

  return (
    <>
      <dl className={styles.facts ?? ''}>
        <dt>From the Sun</dt>
        <dd>
          <Readout value={fmtAu(d.sunDistanceAu)} unit="au" />{' '}
          <Label>{fmtKm(d.sunDistanceAu * AU_KM)} km</Label>
        </dd>
        {earthKm !== null && d.earthDistanceAu !== null && (
          <>
            <dt>From Earth</dt>
            <dd>
              <Readout value={fmtAu(d.earthDistanceAu)} unit="au" />{' '}
              <Label>
                {fmtKm(earthKm)} km · {fmtKm(earthKm * KM_TO_MI)} mi
              </Label>
            </dd>
            <dt>
              <Term id="light-time">Light time</Term>
            </dt>
            <dd>
              <Readout value={formatLightTime(d.lightTimeFromEarthS ?? 0)} />
            </dd>
          </>
        )}
        {d.rangeRateKmS !== null && (
          <>
            <dt>
              <Term id="range-rate">Seen from Earth</Term>
            </dt>
            <dd>
              <Readout value={Math.abs(d.rangeRateKmS).toFixed(1)} unit="km/s" />{' '}
              <Label>{d.rangeRateKmS < 0 ? 'approaching' : 'receding'}</Label>
            </dd>
          </>
        )}
        <dt>Source</dt>
        <dd className={styles.inspectorText ?? ''}>{state.sourceProvider}</dd>
        <dt>
          <Term id="ephemeris">Position type</Term>
        </dt>
        <dd className={styles.inspectorText ?? ''}>
          Kepler approximation (a model, not an observation) · confidence {state.confidence}
        </dd>
        <dt>Sample time</dt>
        <dd className={styles.inspectorText ?? ''}>{formatSimUtc(simMs)}</dd>
      </dl>
      <ul className={styles.reasons ?? ''} aria-label="Why this confidence">
        {state.confidenceReasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <details className={styles.science ?? ''}>
        <summary>Scientific data</summary>
        <dl className={styles.facts ?? ''}>
          <dt>Frame</dt>
          <dd>
            {state.referenceFrame}, centre {state.referenceCenter}
          </dd>
          <dt>Time scale</dt>
          <dd>{state.timeScale}</dd>
          <dt>Julian date</dt>
          <dd>{jd.toFixed(5)}</dd>
          <dt>Position (au)</dt>
          <dd>
            x {state.positionAu.x.toFixed(6)} · y {state.positionAu.y.toFixed(6)} · z{' '}
            {state.positionAu.z.toFixed(6)}
          </dd>
          <dt>Accuracy</dt>
          <dd>{state.accuracyDescription}</dd>
        </dl>
      </details>
    </>
  )
}
