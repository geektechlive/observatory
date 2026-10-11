interface HazardChevronProps {
  height?: number | undefined
  color?: 'amber' | 'copper' | undefined
}

export function HazardChevron({ height = 10, color = 'amber' }: HazardChevronProps) {
  // The same stripe the telemetry plate wears (tokens.css), so every chevron matches.
  const stripe = color === 'copper' ? 'var(--hazard-stripe)' : 'var(--hazard-stripe-amber)'
  return <div style={{ height, flexShrink: 0, background: stripe }} />
}
