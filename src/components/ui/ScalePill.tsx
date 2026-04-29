type PillVariant = 'cyan' | 'amber' | 'magenta'

interface ScalePillProps {
  label: string
  variant?: PillVariant
}

const pillStyles: Record<PillVariant, { bg: string; color: string }> = {
  cyan: { bg: 'rgba(125, 211, 252, 0.12)', color: 'var(--cyan)' },
  amber: { bg: 'rgba(251, 191, 36, 0.12)', color: 'var(--amber)' },
  magenta: { bg: 'rgba(244, 114, 182, 0.12)', color: 'var(--magenta)' },
}

export function ScalePill({ label, variant = 'cyan' }: ScalePillProps) {
  const { bg, color } = pillStyles[variant]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        background: bg,
        border: `1px solid ${color}33`,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        color,
        letterSpacing: '0.04em',
        lineHeight: 1.5,
      }}
    >
      {label}
    </span>
  )
}
