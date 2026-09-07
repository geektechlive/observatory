import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useEpic } from '@/hooks/useEpic'
import { epicImageUrl } from '@/lib/epicUrl'

import styles from './epic-panel.module.css'

function formatEpicDate(dateStr: string): string {
  const [datePart, timePart] = dateStr.split(' ')
  if (!datePart) return dateStr
  const [year, month, day] = datePart.split('-')
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ]
  const monthName = months[Number(month) - 1] ?? month ?? ''
  const time = timePart ? timePart.slice(0, 5) : ''
  return `${day ?? ''} ${monthName} ${year ?? ''} · ${time} UTC`
}

function formatCoord(value: number, posLabel: string, negLabel: string): string {
  const abs = Math.abs(value).toFixed(2)
  const label = value >= 0 ? posLabel : negLabel
  return `${abs}° ${label}`
}

export function EpicPanel() {
  const { data, isLoading, error } = useEpic()
  const updatedAt = useQueryClient().getQueryState(['epic'])?.dataUpdatedAt ?? 0
  const [imgFailed, setImgFailed] = useState(false)
  const [lastImage, setLastImage] = useState(data?.image)

  // Reset the failure flag when a new EPIC image comes in, so it gets a
  // fresh attempt. Adjusted during render (not an effect) per React's
  // guidance for state that depends on a changed prop.
  if (data?.image !== lastImage) {
    setLastImage(data?.image)
    setImgFailed(false)
  }

  if (isLoading && !data) {
    return (
      <GlassPanel variant="panel" label="Earth Now">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="panel" label="Earth Now">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  const imgSrc = epicImageUrl(data, 'jpg')
  const fullResSrc = epicImageUrl(data, 'png')

  if (imgFailed || imgSrc === null) {
    return (
      <GlassPanel variant="panel" label="Earth Now">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  const caption =
    data.caption.length > 120 ? data.caption.slice(0, 120).trimEnd() + '…' : data.caption

  return (
    <GlassPanel variant="panel" label="Earth Now">
      <div className={styles.epicPanel ?? ''}>
        <DataAge updatedAt={updatedAt} />
        <div className={styles.imageWrap ?? ''}>
          <img
            src={imgSrc}
            alt="Full-disk view of Earth from the DSCOVR satellite"
            className={styles.image ?? ''}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            width={800}
            height={800}
            onError={() => {
              setImgFailed(true)
            }}
          />
        </div>
        <div className={styles.meta ?? ''}>
          <div className={styles.metaTop ?? ''}>
            <span className={styles.date ?? ''}>{formatEpicDate(data.date)}</span>
            <span className={styles.coords ?? ''}>
              {formatCoord(data.centroidLat, 'N', 'S')} &nbsp;·&nbsp;{' '}
              {formatCoord(data.centroidLon, 'E', 'W')}
            </span>
            {fullResSrc && (
              <a
                href={fullResSrc}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.fullResLink ?? ''}
              >
                Full resolution
              </a>
            )}
          </div>
          <p className={styles.caption ?? ''}>{caption}</p>
        </div>
      </div>
    </GlassPanel>
  )
}
