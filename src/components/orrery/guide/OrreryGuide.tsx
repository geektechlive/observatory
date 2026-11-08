import { useEffect, useMemo, useRef } from 'react'

import { useOrreryNeo } from '@/hooks/useOrreryNeo'
import { GLOSSARY, glossaryEntry } from '@/lib/orrery/glossary'

import type { OrreryLink } from '../orreryLink'
import styles from './guide.module.css'
import { buildLessons, type Lesson } from './lessons'
import { type Block, DATA_SOURCES, SECTIONS } from './sections'

export type GuideMode = 'open' | 'compact'

export interface ShownLesson {
  id: string
  title: string
  tryIt: string
}

interface OrreryGuideProps {
  mode: GuideMode
  /** The lesson on show, once "Show me" was pressed. */
  shown: ShownLesson | null
  /** Apply a lesson's link to the scene (the page runs it through useOrreryLink). */
  onShow: (lesson: ShownLesson, link: OrreryLink) => void
  onExpand: () => void
  onClose: () => void
  /** The collapsed bar's height in px, 0 when it is not showing: the inspector sits below it. */
  onBarHeight: (px: number) => void
}

function Blocks({ blocks }: { blocks: readonly Block[] }) {
  return blocks.map((b, i) => {
    const key = `${b.kind}-${String(i)}`
    switch (b.kind) {
      case 'p':
        return (
          <p key={key} className={styles.text ?? ''}>
            {b.text}
          </p>
        )
      case 'list':
        return (
          <ul key={key} className={styles.list ?? ''}>
            {b.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )
      case 'terms':
        return (
          <dl key={key} className={styles.terms ?? ''}>
            {b.ids.map((id) => {
              const e = glossaryEntry(id)
              return (
                <div key={id}>
                  <dt>{e.term}</dt>
                  <dd>{e.short}</dd>
                </div>
              )
            })}
          </dl>
        )
      case 'marks':
        return (
          <ul key={key} className={styles.marks ?? ''}>
            {b.items.map((m) => (
              <li key={m.name}>
                <span className={styles.dot ?? ''} data-tone={m.tone} aria-hidden="true" />
                <span>
                  <strong>{m.name}.</strong> {m.text}
                </span>
              </li>
            ))}
          </ul>
        )
    }
  })
}

function LessonCard({ lesson, onShow }: { lesson: Lesson; onShow: () => void }) {
  return (
    <article className={styles.lesson ?? ''} aria-labelledby={`guide-lesson-${lesson.id}`}>
      <h4 id={`guide-lesson-${lesson.id}`} className={styles.lessonTitle ?? ''}>
        {lesson.title}
      </h4>
      {lesson.paragraphs.map((p) => (
        <p key={p} className={styles.text ?? ''}>
          {p}
        </p>
      ))}
      <p className={styles.try ?? ''}>
        <strong>Try this.</strong> {lesson.tryIt}
      </p>
      <button
        type="button"
        className={styles.show ?? ''}
        disabled={lesson.link === null}
        data-lesson={lesson.id}
        onClick={onShow}
      >
        Show me
      </button>
      {lesson.unavailable && <p className={styles.note ?? ''}>{lesson.unavailable}</p>}
      <details className={styles.sourceNote ?? ''}>
        <summary>Sources</summary>
        <ul>
          {lesson.sources.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </details>
    </article>
  )
}

/**
 * The orrery's guide (#159): a drawer of short lessons, each with a Show me button that
 * sets the scene, and the reference sections behind them. It stays mounted while a lesson
 * is on show, collapsed to a bar, so the inspector can open where the drawer was and one
 * press brings the lessons back.
 *
 * Loaded on first open as its own chunk; nothing here is in the page's first load.
 */
export function OrreryGuide({
  mode,
  shown,
  onShow,
  onExpand,
  onClose,
  onBarHeight,
}: OrreryGuideProps) {
  // The page already asks for the close approaches; this shares its query, not a second fetch.
  const neo = useOrreryNeo().data
  const lessons = useMemo(
    () =>
      buildLessons({
        approaches: (neo?.approaches ?? []).map((a) => ({
          id: a.id,
          des: a.des,
          name: a.name,
          pha: a.pha,
          placed: a.fine !== null,
          closeApproach: { date: a.closeApproach.date, distAu: a.closeApproach.distAu },
        })),
      }),
    [neo],
  )
  const heading = useRef<HTMLHeadingElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const barRef = useRef<HTMLElement>(null)

  // Esc closes the guide, unless something already used it: a term's popover stops it, and
  // in a text field or the Find combobox Esc means "dismiss the suggestions", not "leave".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('input, textarea, select, [role="combobox"]'))
        return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Tell the page how tall the bar is (its tip opens and closes), so the inspector can
  // start below it instead of under it.
  useEffect(() => {
    const el = barRef.current
    if (mode !== 'compact' || !el) {
      onBarHeight(0)
      return
    }
    const report = () => {
      onBarHeight(el.getBoundingClientRect().height)
    }
    report()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => {
      observer.disconnect()
      onBarHeight(0)
    }
  }, [mode, onBarHeight])

  // Keep the keyboard where the visitor is: the heading when the drawer opens, the way
  // back when it collapses.
  useEffect(() => {
    if (mode === 'open') heading.current?.focus()
    else back.current?.focus()
  }, [mode])

  return (
    <>
      <aside
        id="orrery-guide"
        className={styles.drawer ?? ''}
        aria-labelledby="orrery-guide-title"
        hidden={mode !== 'open'}
        data-guide-drawer=""
      >
        <div className={styles.head ?? ''}>
          <h2 id="orrery-guide-title" ref={heading} tabIndex={-1} className={styles.title ?? ''}>
            Guide
          </h2>
          <button type="button" className={styles.btn ?? ''} onClick={onClose}>
            Close
          </button>
        </div>
        <p className={styles.text ?? ''}>
          New to this? Start with a lesson. Each one explains a single idea, and Show me sets the
          scene so you can see it. You can come back here at any time.
        </p>

        <section aria-labelledby="guide-lessons">
          <h3 id="guide-lessons" className={styles.group ?? ''}>
            Lessons
          </h3>
          {lessons.map((l) => (
            <LessonCard
              key={l.id}
              lesson={l}
              onShow={() => {
                if (l.link) onShow({ id: l.id, title: l.title, tryIt: l.tryIt }, l.link)
              }}
            />
          ))}
        </section>

        <section aria-labelledby="guide-reference">
          <h3 id="guide-reference" className={styles.group ?? ''}>
            How it works
          </h3>
          {SECTIONS.map((s) => (
            <details key={s.id} className={styles.section ?? ''} data-section={s.id}>
              <summary>{s.title}</summary>
              <Blocks blocks={s.blocks} />
              {s.id === 'data' && (
                <ul className={styles.sources ?? ''}>
                  {DATA_SOURCES.map((d) => (
                    <li key={d.name}>
                      <a href={d.url} target="_blank" rel="noreferrer">
                        {d.name}
                      </a>
                      <span>{d.gives}</span>
                      <span className={styles.fresh ?? ''}>{d.fresh}</span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))}
          <details className={styles.section ?? ''} data-section="glossary">
            <summary>Glossary</summary>
            <dl className={styles.terms ?? ''}>
              {GLOSSARY.map((e) => (
                <div key={e.id}>
                  <dt>{e.term}</dt>
                  <dd>{e.more ? `${e.short} ${e.more}` : e.short}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      </aside>

      {mode === 'compact' && (
        <aside
          ref={barRef}
          className={styles.bar ?? ''}
          aria-label="Lesson on show"
          data-guide-bar=""
        >
          <p className={styles.barTitle ?? ''}>{shown?.title ?? 'Guide'}</p>
          <div className={styles.barActions ?? ''}>
            <button ref={back} type="button" className={styles.btn ?? ''} onClick={onExpand}>
              Back to guide
            </button>
            <button type="button" className={styles.btn ?? ''} onClick={onClose}>
              Close
            </button>
          </div>
          {shown && (
            <details className={styles.barTry ?? ''}>
              <summary>What to look for</summary>
              <p className={styles.text ?? ''}>{shown.tryIt}</p>
            </details>
          )}
        </aside>
      )}
    </>
  )
}
