interface HazardChevronProps {
  height?: number | undefined
  color?: 'amber' | 'copper' | undefined
}

export function HazardChevron({ height = 10, color = 'amber' }: HazardChevronProps) {
  const stripe = color === 'copper' ? 'var(--copper)' : 'var(--amber)'
  return (
    <div
      style={{
        height,
        flexShrink: 0,
        background: `repeating-linear-gradient(45deg, ${stripe} 0 14px, var(--void) 14px 28px)`,
      }}
    />
  )
}
