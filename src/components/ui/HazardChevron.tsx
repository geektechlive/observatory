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
        background: `repeating-linear-gradient(45deg, ${stripe} 0 14px, oklch(0.10 0.01 60) 14px 28px)`,
      }}
    />
  )
}
