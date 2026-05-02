export function BelterSeal() {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2
    const x1 = 42 + Math.cos(a) * 36
    const y1 = 42 + Math.sin(a) * 36
    const x2 = 42 + Math.cos(a) * 40
    const y2 = 42 + Math.sin(a) * 40
    return { x1, y1, x2, y2, key: i }
  })

  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-label="Tycho Station seal">
      <defs>
        <linearGradient id="belterSealGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.14 55)" />
          <stop offset="100%" stopColor="oklch(0.50 0.13 45)" />
        </linearGradient>
      </defs>
      <circle cx="42" cy="42" r="40" fill="none" stroke="url(#belterSealGrad)" strokeWidth="1.5" />
      <circle cx="42" cy="42" r="34" fill="none" stroke="url(#belterSealGrad)" strokeWidth="0.6" />
      {ticks.map(({ x1, y1, x2, y2, key }) => (
        <line
          key={key}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--copper-glow)"
          strokeWidth="0.6"
        />
      ))}
      <text
        x="42"
        y="46"
        textAnchor="middle"
        fontFamily="var(--font-stencil)"
        fontSize="11"
        fill="var(--copper-glow)"
        letterSpacing="2"
      >
        ◇ TYCHO ◇
      </text>
      <text
        x="42"
        y="58"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="7"
        fill="var(--bone-faint)"
        letterSpacing="1.5"
      >
        EST 2237
      </text>
    </svg>
  )
}
