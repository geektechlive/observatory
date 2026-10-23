import liveStyles from './live-indicator.module.css'

type LiveStatus = 'syncing' | 'live' | 'degraded' | 'offline'

interface LiveIndicatorProps {
  status?: LiveStatus
  /** Healthy feed count, shown as "Live, N feeds" (#63). */
  feeds?: number | undefined
}

const LABEL: Record<LiveStatus, string> = {
  syncing: 'Syncing',
  live: 'Live',
  degraded: 'Degraded',
  offline: 'Offline',
}

const STATUS_CLASS: Record<LiveStatus, string> = {
  syncing: liveStyles.syncing ?? '',
  live: liveStyles.live ?? '',
  degraded: liveStyles.degraded ?? '',
  offline: liveStyles.offline ?? '',
}

/** Feed health. A status region, so LIVE turning DEGRADED is announced. */
export function LiveIndicator({ status = 'live', feeds }: LiveIndicatorProps) {
  const label =
    status === 'live' && feeds !== undefined
      ? `${LABEL.live}, ${String(feeds)} ${feeds === 1 ? 'feed' : 'feeds'}`
      : LABEL[status]
  return (
    <div className={[liveStyles.root, STATUS_CLASS[status]].join(' ')} role="status">
      <span className={liveStyles.dot ?? ''} aria-hidden="true" />
      <span className={liveStyles.label ?? ''}>{label}</span>
    </div>
  )
}
