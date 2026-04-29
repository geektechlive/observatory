import liveStyles from './live-indicator.module.css'

interface LiveIndicatorProps {
  live?: boolean
}

export function LiveIndicator({ live = true }: LiveIndicatorProps) {
  return (
    <div className={liveStyles.root} aria-label={live ? 'Live data' : 'Offline'}>
      <span className={[liveStyles.dot, live ? liveStyles.live : liveStyles.offline].join(' ')} />
      <span className={liveStyles.label}>{live ? 'Live' : 'Offline'}</span>
    </div>
  )
}
