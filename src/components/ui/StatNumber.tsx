interface StatNumberProps {
  value: string | number
  unit?: string
  label?: string
  accent?: 'cyan' | 'amber' | 'magenta' | 'green'
}

const accentColor: Record<NonNullable<StatNumberProps['accent']>, string> = {
  cyan: 'var(--cyan)',
  amber: 'var(--amber)',
  magenta: 'var(--magenta)',
  green: 'var(--green)',
}

export function StatNumber({ value, unit, label, accent }: StatNumberProps) {
  const color = accent ? accentColor[accent] : 'var(--ink)'

  return (
    <div>
      {label && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--ink-faint)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {label}
        </div>
      )}
      <div
        data-mono
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 'clamp(1.25rem, 1rem + 1vw, 1.75rem)',
          color,
          lineHeight: 1,
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--ink-dim)',
              marginLeft: 4,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}
