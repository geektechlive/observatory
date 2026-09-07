import { useState } from 'react'

import { GlassPanel } from '@/components/ui/GlassPanel'
import { useApod } from '@/hooks/useApod'

import styles from './apod-card.module.css'
import { ApodLightbox } from './ApodLightbox'

export function ApodCard() {
  const { data, isLoading, error } = useApod()
  const [expanded, setExpanded] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

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

  const lightboxSrc = data.hdurl ?? data.url
  const canLightbox = data.media_type === 'image'

  return (
    <GlassPanel variant="hero" label="APOD">
      <div className={styles.apodCard ?? ''}>
        {data.media_type === 'image' ? (
          <div className={styles.imageWrap ?? ''}>
            {canLightbox ? (
              <button
                type="button"
                className={styles.imageButton ?? ''}
                onClick={() => {
                  setLightboxOpen(true)
                }}
                aria-label={`View full-size: ${data.title}`}
              >
                <img
                  src={data.url}
                  alt={data.title}
                  className={`${styles.image ?? ''} ${styles.imageClickable ?? ''}`}
                  loading="lazy"
                  width={1200}
                  height={220}
                />
              </button>
            ) : (
              <img
                src={data.url}
                alt={data.title}
                className={styles.image ?? ''}
                loading="lazy"
                width={1200}
                height={220}
              />
            )}
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

        <div
          className={`${styles.explanationWrap ?? ''} ${expanded ? (styles.explanationWrapOpen ?? '') : ''}`}
        >
          <p className={styles.explanation ?? ''}>{data.explanation}</p>
        </div>

        <button
          type="button"
          className={styles.readMore ?? ''}
          onClick={() => {
            setExpanded((prev) => !prev)
          }}
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>

        <div className={styles.meta ?? ''}>
          <span>{data.date}</span>
          {data.copyright && <span>© {data.copyright.trim()}</span>}
        </div>
      </div>

      {lightboxOpen && canLightbox && (
        <ApodLightbox
          src={lightboxSrc}
          alt={data.title}
          onClose={() => {
            setLightboxOpen(false)
          }}
        />
      )}
    </GlassPanel>
  )
}
