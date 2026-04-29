import { useState } from 'react'
import { useApod } from '@/hooks/useApod'
import { GlassPanel } from '@/components/ui/GlassPanel'
import styles from './apod-card.module.css'

export function ApodCard() {
  const { data, isLoading, error } = useApod()
  const [expanded, setExpanded] = useState(false)

  if (isLoading && !data) {
    return (
      <GlassPanel variant="hero" label="APOD">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="hero" label="APOD">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel variant="hero" label="APOD">
      <div className={styles.apodCard ?? ''}>
        {data.media_type === 'image' ? (
          <div className={styles.imageWrap ?? ''}>
            <img
              src={data.url}
              alt={data.title}
              className={styles.image ?? ''}
              loading="lazy"
              width={1200}
              height={220}
            />
          </div>
        ) : (
          <div className={styles.videoPlaceholder ?? ''}>
            <span className={styles.videoIcon ?? ''} aria-hidden="true">
              ▶
            </span>
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.videoLink ?? ''}
            >
              {data.media_type === 'video' ? 'Video · Open on NASA' : 'Interactive · Open on NASA'}
            </a>
          </div>
        )}

        <h2 className={styles.title ?? ''}>{data.title}</h2>

        <p className={expanded ? (styles.explanationExpanded ?? '') : (styles.explanation ?? '')}>
          {data.explanation}
        </p>

        <button
          type="button"
          className={styles.readMore ?? ''}
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>

        <div className={styles.meta ?? ''}>
          <span>{data.date}</span>
          {data.copyright && <span>© {data.copyright.trim()}</span>}
        </div>
      </div>
    </GlassPanel>
  )
}
