import { usePlanets } from '@/hooks/usePlanets'
import { useSunMoon } from '@/hooks/useSunMoon'
import { isWaxing, moonLitPath } from '@/lib/moon'
import styles from './sky-stage.module.css'

const PLANET_COLORS: Record<string, string> = {
  Moon: 'oklch(0.9 0.02 250)',
  Mercury: 'oklch(0.72 0.03 70)',
  Venus: 'oklch(0.92 0.08 95)',
  Mars: 'oklch(0.62 0.2 25)',
  Jupiter: 'oklch(0.78 0.09 70)',
  Saturn: 'oklch(0.85 0.08 95)',
  Uranus: 'oklch(0.82 0.1 200)',
  Neptune: 'oklch(0.65 0.15 250)',
}

// Azimuthal-equidistant from the north celestial pole: Dec +90 → center, −90 → rim.
function project(raHours: number, decDeg: number, R: number): { x: number; y: number } {
  const ang = (raHours / 24) * 2 * Math.PI - Math.PI / 2
  const r = ((90 - decDeg) / 180) * R
  return { x: Math.cos(ang) * r, y: Math.sin(ang) * r }
}

// Deterministic background stars (seeded, so they don't jump on re-render).
function makeStars(n: number, R: number): { x: number; y: number; r: number }[] {
  let seed = 1337
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const out: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = rand() * 2 * Math.PI
    const rr = Math.sqrt(rand()) * R * 0.98
    out.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, r: 0.3 + rand() * 0.8 })
  }
  return out
}

function dotRadius(mag: number | null): number {
  if (mag === null) return 3
  return Math.min(6, Math.max(2.2, 4.6 - mag * 0.4))
}

export function SkyStage({ size = 460 }: { size?: number }) {
  const { data } = usePlanets()
  const { data: sunMoon } = useSunMoon()

  const R = size / 2 - 14
  const bodies = (data?.bodies ?? []).filter((b) => b.name !== 'Sun')
  const moon = bodies.find((b) => b.name === 'Moon')
  const planets = bodies.filter((b) => b.name !== 'Moon')
  const stars = makeStars(140, R)

  const moonIllum = sunMoon?.fracIllum ?? 50
  const moonWax = isWaxing(sunMoon?.curPhase ?? 'Waxing')

  return (
    <div className={styles.stage ?? ''} style={{ width: size, height: size }}>
      <svg
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        className={styles.sky ?? ''}
        role="img"
        aria-label="Celestial chart — planets and the Moon by right ascension and declination"
      >
        <defs>
          <radialGradient id="sky-grad" cx="50%" cy="42%">
            <stop offset="0%" stopColor="oklch(0.16 0.04 250)" />
            <stop offset="70%" stopColor="oklch(0.09 0.03 255)" />
            <stop offset="100%" stopColor="oklch(0.05 0.02 260)" />
          </radialGradient>
        </defs>

        <circle r={R} fill="url(#sky-grad)" stroke="var(--glass-border)" strokeWidth={1} />

        {/* Declination rings */}
        {[60, 30, 0, -30].map((dec) => (
          <circle
            key={dec}
            r={((90 - dec) / 180) * R}
            fill="none"
            stroke="var(--copper)"
            strokeWidth={0.4}
            opacity={dec === 0 ? 0.35 : 0.14}
            strokeDasharray={dec === 0 ? undefined : '2 4'}
          />
        ))}

        {/* RA spokes + hour labels */}
        {[0, 6, 12, 18].map((h) => {
          const ang = (h / 24) * 2 * Math.PI - Math.PI / 2
          const x = Math.cos(ang) * R
          const y = Math.sin(ang) * R
          return (
            <g key={h}>
              <line
                x1={0}
                y1={0}
                x2={x}
                y2={y}
                stroke="var(--copper)"
                strokeWidth={0.35}
                opacity={0.12}
              />
              <text
                x={x * 0.92}
                y={y * 0.92}
                textAnchor="middle"
                fontSize={7}
                fontFamily="var(--font-mono)"
                fill="var(--ink-faint)"
              >
                {h}h
              </text>
            </g>
          )
        })}

        {/* Stars */}
        {stars.map((s, i) => (
          <circle key={`star${i}`} cx={s.x} cy={s.y} r={s.r} fill="var(--bone)" opacity={0.5} />
        ))}

        {/* Planets */}
        {planets.map((p) => {
          const { x, y } = project(p.raHours, p.decDeg, R)
          const c = PLANET_COLORS[p.name] ?? 'var(--bone)'
          return (
            <g key={p.name}>
              <title>
                {p.name} — mag {p.mag ?? '—'}
              </title>
              <circle cx={x} cy={y} r={dotRadius(p.mag)} fill={c} />
              <circle
                cx={x}
                cy={y}
                r={dotRadius(p.mag) + 2.5}
                fill="none"
                stroke={c}
                strokeWidth={0.5}
                opacity={0.4}
              />
              <text
                x={x}
                y={y - dotRadius(p.mag) - 4}
                textAnchor="middle"
                fontSize={7.5}
                fontFamily="var(--font-stencil)"
                fill="var(--bone-dim)"
              >
                {p.name}
              </text>
            </g>
          )
        })}

        {/* Moon with real phase */}
        {moon && (
          <g
            transform={`translate(${project(moon.raHours, moon.decDeg, R).x} ${project(moon.raHours, moon.decDeg, R).y})`}
          >
            <title>Moon — {sunMoon?.curPhase ?? ''}</title>
            <circle
              r={8}
              fill="oklch(0.18 0.01 250)"
              stroke="var(--glass-border)"
              strokeWidth={0.5}
            />
            <path
              d={moonLitPath(8, moonIllum / 100, moonWax)}
              fill="oklch(0.92 0.03 95)"
              opacity={0.95}
            />
          </g>
        )}
      </svg>
      <div className={styles.caption ?? ''}>
        <span className={styles.capLabel ?? ''}>NIGHT SKY</span>
        <span className={styles.capSub ?? ''}>Planets &amp; Moon · geocentric RA/Dec</span>
      </div>
    </div>
  )
}
