import { type KeyboardEvent, useEffect, useRef, useState } from 'react'

import type { ModelDescriptor } from '@/lib/orrery/modelDescriptor'

import styles from './detail-view.module.css'
import { DETAIL_VIEW_ID } from './detailViewId'
import { loadModel, type ModelLoader } from './three/craftModelLoad'
import {
  type CreateDetailScene,
  createDetailScene,
  type DetailSceneHandle,
  type DetailStats,
  detailStats,
} from './three/DetailScene'
import { loadGltfScene } from './three/gltfLoad'

interface DetailViewProps {
  descriptor: ModelDescriptor
  /** What the model is of: a craft's or a satellite's name. */
  title: string
  /** `user`: Back to orrery or Escape. `lost`: the WebGL context was lost or could not start. */
  onClose: (cause: DetailCloseCause) => void
  reducedMotion: boolean
  /** Told the live scene and model counts after each change; the leak test reads them. */
  onStats?: ((stats: DetailStats) => void) | undefined
  /** Swapped for a fake in tests (no WebGL). */
  createScene?: CreateDetailScene | undefined
  load?: ModelLoader | undefined
}

export type DetailCloseCause = 'user' | 'lost'

type Status = 'loading' | 'ready' | 'failed'

/** One arrow-key press turns the model this far, in radians (about 7 degrees). */
const ROTATE_STEP = 0.12
/** One zoom press moves the camera to this share of its distance (in), or its inverse (out). */
const ZOOM_IN = 0.8
const ANNOUNCE: Record<Status, string> = {
  loading: 'Loading the model',
  ready: 'Model ready',
  // The alert announces the failure; a second message here would read it twice.
  failed: '',
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** The note a stand-in model carries, or null for a model of the very object. */
function standInNote(descriptor: ModelDescriptor, title: string): string | null {
  if (descriptor.kind === 'standin') {
    return `A simplified model built for this site. The real ${title} is not exactly this shape.`
  }
  if (descriptor.scope === 'family') {
    return `A stand-in shared by this kind of satellite. It is not the exact shape of ${title}.`
  }
  return null
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} className={styles.detailLink ?? ''} target="_blank" rel="noreferrer noopener">
      {children}
      <span className={styles.srOnly ?? ''}> (opens in a new tab)</span>
    </a>
  )
}

/**
 * The credit line. A model under a licence that asks for the source, the licence and the
 * changes reads "Model: <credit> (source), <licence> (licence). <changes>"; a NASA model
 * keeps the short form.
 */
function ModelCredit({ descriptor }: { descriptor: ModelDescriptor }) {
  const { credit, licence, licenceUrl, changes, sourceUrl } = descriptor
  if (!licenceUrl && !changes) {
    return (
      <p>
        Model: {credit} · {licence}
        {sourceUrl && (
          <>
            {' · '}
            <ExternalLink href={sourceUrl}>Source</ExternalLink>
          </>
        )}
      </p>
    )
  }
  return (
    <p>
      Model: {credit}
      {sourceUrl && (
        <>
          {' ('}
          <ExternalLink href={sourceUrl}>source</ExternalLink>
          {')'}
        </>
      )}
      {', '}
      {licence}
      {licenceUrl && (
        <>
          {' ('}
          <ExternalLink href={licenceUrl}>licence</ExternalLink>
          {')'}
        </>
      )}
      {'.'}
      {changes && ` ${changes}`}
    </p>
  )
}

/**
 * The "Look closer" view (#203, ADR 0021): the object's 3D model on a canvas of its own,
 * filling the stage. The inspector stays beside it with the facts. Mounted only while
 * open; closing unmounts it, which aborts a load in flight and disposes the scene.
 */
export function DetailView({
  descriptor,
  title,
  onClose,
  reducedMotion,
  onStats,
  createScene = createDetailScene,
  load = loadGltfScene,
}: DetailViewProps) {
  const host = useRef<HTMLDivElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const scene = useRef<DetailSceneHandle | null>(null)
  const latest = useRef({ onClose, onStats, reducedMotion, descriptor })
  const [attempt, setAttempt] = useState(0)
  const [outcome, setOutcome] = useState<{ attempt: number; ok: boolean } | null>(null)
  // The file or stand-in, not the descriptor object: a new object for the same model
  // (the page rebuilds it when satellites load) must not reload it.
  const descriptorKey = descriptor.kind === 'file' ? descriptor.file : descriptor.standIn

  useEffect(() => {
    latest.current = { onClose, onStats, reducedMotion, descriptor }
  })

  // The scene: made once on open, disposed on close. It owns its canvas, so React never
  // reuses a canvas whose context a previous scene force-lost.
  useEffect(() => {
    const el = host.current
    if (!el) return
    let made: DetailSceneHandle
    try {
      made = createScene(el, {
        reducedMotion: latest.current.reducedMotion,
        onContextLost: () => {
          latest.current.onClose('lost')
        },
      })
    } catch (error) {
      console.warn('[orrery] The model view could not start WebGL:', error)
      latest.current.onClose('lost')
      return
    }
    scene.current = made
    latest.current.onStats?.(detailStats())
    return () => {
      scene.current = null
      made.dispose()
      latest.current.onStats?.(detailStats())
    }
  }, [createScene])

  // The model: loaded (or built) for this attempt; closing or retrying aborts it.
  useEffect(() => {
    const target = scene.current
    if (!target) return
    const controller = new AbortController()
    loadModel(latest.current.descriptor, load, controller.signal).then(
      (model) => {
        if (controller.signal.aborted) {
          model.dispose()
          return
        }
        target.setModel(model)
        latest.current.onStats?.(detailStats())
        setOutcome({ attempt, ok: true })
      },
      (error: unknown) => {
        if (isAbort(error) || controller.signal.aborted) return
        console.warn('[orrery] A model failed to load:', error)
        setOutcome({ attempt, ok: false })
      },
    )
    return () => {
      controller.abort()
    }
  }, [descriptorKey, load, attempt])

  // Escape closes only this view. A control that used the key (a Term popover stops it)
  // never reaches here; the Find box and an open guide dismiss themselves first.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('input, textarea, select, [role="combobox"]')) {
        return
      }
      if (document.querySelector('[data-guide-drawer]')) return
      e.preventDefault()
      latest.current.onClose('user')
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    backButton.current?.focus()
  }, [])

  const onModelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = scene.current
    if (!target) return
    const turn: Record<string, [number, number]> = {
      ArrowLeft: [-ROTATE_STEP, 0],
      ArrowRight: [ROTATE_STEP, 0],
      ArrowUp: [0, -ROTATE_STEP],
      ArrowDown: [0, ROTATE_STEP],
    }
    const step = turn[e.key]
    if (step) {
      e.preventDefault()
      target.rotate(step[0], step[1])
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      target.zoom(ZOOM_IN)
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      target.zoom(1 / ZOOM_IN)
    }
  }

  const status: Status =
    outcome?.attempt === attempt ? (outcome.ok ? 'ready' : 'failed') : 'loading'
  const note = standInNote(descriptor, title)

  return (
    <div
      id={DETAIL_VIEW_ID}
      className={styles.detailView ?? ''}
      data-detail-view=""
      data-detail-status={status}
      role="region"
      aria-label={`Close-up of ${title}`}
    >
      {/* Three bands, top to bottom: this bar, the model's canvas, the credit. The canvas sits
          between the other two, so the model never draws under the title, the controls or the
          credit line (#205). */}
      <div className={styles.detailBar ?? ''}>
        <h2 className={styles.detailTitle ?? ''}>{title}</h2>
        <div className={styles.detailZoom ?? ''}>
          <button
            type="button"
            className={styles.detailZoomBtn ?? ''}
            aria-label="Zoom in"
            onClick={() => {
              scene.current?.zoom(ZOOM_IN)
            }}
          >
            +
          </button>
          <button
            type="button"
            className={styles.detailZoomBtn ?? ''}
            aria-label="Zoom out"
            onClick={() => {
              scene.current?.zoom(1 / ZOOM_IN)
            }}
          >
            −
          </button>
        </div>
        <button
          ref={backButton}
          type="button"
          className={styles.detailClose ?? ''}
          onClick={() => {
            onClose('user')
          }}
        >
          Back to orrery
        </button>
      </div>
      {/* A focusable group: arrow keys turn the model and plus and minus zoom it, so it takes
          the keyboard like a custom widget. Plain pointer drags are OrbitControls' own. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={host}
        className={styles.detailCanvas ?? ''}
        role="group"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
        tabIndex={0}
        aria-label={`Model of ${title}. Arrow keys turn it, plus and minus zoom.`}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + -"
        onKeyDown={onModelKey}
      />
      <p className={styles.srOnly ?? ''} role="status" data-detail-announce="">
        {ANNOUNCE[status]}
      </p>
      {status === 'loading' && (
        <p className={styles.detailStatus ?? ''} aria-hidden="true">
          Loading the model…
        </p>
      )}
      {status === 'failed' && (
        <div className={styles.detailStatus ?? ''} role="alert">
          <p>Model unavailable</p>
          <button
            type="button"
            className={styles.detailRetry ?? ''}
            onClick={() => {
              // The button is about to go away: keep focus in the view.
              host.current?.focus()
              setAttempt((a) => a + 1)
            }}
          >
            Retry
          </button>
        </div>
      )}
      <div className={styles.detailCredit ?? ''} data-detail-credit="">
        {note && <p>{note}</p>}
        <ModelCredit descriptor={descriptor} />
      </div>
    </div>
  )
}
