import liveStyles from './live-indicator.module.css'

type LiveStatus = 'live' | 'degraded' | 'offline'

interface LiveIndicatorProps {
  status?: LiveStatus
}

const LABEL: Record<LiveStatus, string> = {
  live: 'Live',
  degraded: 'Degraded',
  offline: 'Offline',
}

const DOT_CLASS: Record<LiveStatus, string> = {
  live: liveStyles.live ?? '',
  degraded: liveStyles.degraded ?? '',
  offline: liveStyles.offline ?? '',
}

export function LiveIndicator({ status = 'live' }: LiveIndicatorProps) {
  return (
    <div className={liveStyles.root} aria-label={LABEL[status]}>
      <span className={[liveStyles.dot, DOT_CLASS[status]].join(' ')} />
      <span className={liveStyles.label ?? ''}>{LABEL[status]}</span>
    </div>
  )
}
