/* Hand-drawn SVG schematics — ISS truss, Roci ship, orbit diagram, solar wind */

export function ISSDiagram({
  size = 300,
  color = 'var(--signal)',
}: {
  size?: number
  color?: string
}) {
  const trussX = [80, 130, 180, 230, 280, 330, 380]
  const arrayCells = [0, 1, 2, 3]
  const rivets = [210, 250, 290, 330, 370, 410, 450, 490, 530, 570]

  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 480 300" style={{ display: 'block' }}>
      <defs>
        <filter id="issGlow">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
        </filter>
      </defs>
      <g stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round">
        {/* Truss spine */}
        <line x1="40" y1="150" x2="440" y2="150" strokeWidth="2.5" />
        {trussX.map((x) => (
          <line key={x} x1={x} y1="142" x2={x} y2="158" strokeWidth="0.8" />
        ))}
        {/* Solar arrays — left */}
        <rect x="20" y="60" width="60" height="38" />
        <rect x="20" y="105" width="60" height="38" />
        <rect x="20" y="160" width="60" height="38" />
        <rect x="20" y="205" width="60" height="38" />
        {arrayCells.map((i) => (
          <line
            key={i}
            x1={20 + i * 10}
            y1="60"
            x2={20 + i * 10}
            y2="243"
            strokeWidth="0.4"
            opacity="0.6"
          />
        ))}
        {/* Solar arrays — right */}
        <rect x="400" y="60" width="60" height="38" />
        <rect x="400" y="105" width="60" height="38" />
        <rect x="400" y="160" width="60" height="38" />
        <rect x="400" y="205" width="60" height="38" />
        {arrayCells.map((i) => (
          <line
            key={i}
            x1={400 + i * 15}
            y1="60"
            x2={400 + i * 15}
            y2="243"
            strokeWidth="0.4"
            opacity="0.6"
          />
        ))}
        {/* Central modules */}
        <rect x="160" y="120" width="80" height="60" rx="6" />
        <rect x="245" y="125" width="70" height="50" rx="5" />
        <rect x="120" y="130" width="35" height="40" rx="3" />
        <rect x="320" y="128" width="40" height="44" rx="4" />
        <ellipse cx="200" cy="100" rx="14" ry="8" />
        <line x1="200" y1="108" x2="200" y2="120" />
        {/* Radiators */}
        <rect x="155" y="200" width="60" height="32" />
        <rect x="245" y="200" width="60" height="32" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1={160 + i * 12} y1="200" x2={160 + i * 12} y2="232" strokeWidth="0.4" />
            <line x1={250 + i * 12} y1="200" x2={250 + i * 12} y2="232" strokeWidth="0.4" />
          </g>
        ))}
        {/* Scale line */}
        <line
          x1="40"
          y1="20"
          x2="440"
          y2="20"
          strokeDasharray="2 4"
          strokeWidth="0.6"
          opacity="0.6"
        />
        {[80, 160, 240, 320, 400].map((x) => (
          <line key={x} x1={x} y1="14" x2={x} y2="26" strokeWidth="0.6" opacity="0.6" />
        ))}
      </g>
      {/* Rivets */}
      <g fill={color} opacity="0.5">
        {rivets.map((x) => (
          <g key={x}>
            <circle cx={x} cy="158" r="1.2" />
            <circle cx={x} cy="192" r="1.2" />
          </g>
        ))}
      </g>
      {/* Labels */}
      <g fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1.5" fill={color} opacity="0.85">
        <text x="40" y="14">
          SCALE 1:1200
        </text>
        <text x="440" y="14" textAnchor="end">
          PROJ. PORT-VIEW
        </text>
        <text x="50" y="285" letterSpacing="2">
          SOLAR ARRAY P6
        </text>
        <text x="430" y="285" textAnchor="end" letterSpacing="2">
          S6
        </text>
        <text x="195" y="116">
          ZARYA
        </text>
        <text x="252" y="120">
          UNITY
        </text>
      </g>
      {/* Leader lines */}
      <g stroke={color} strokeWidth="0.5" fill="none" opacity="0.7">
        <path d="M200,90 L200,40 L260,40" />
        <path d="M280,232 L280,260 L340,260" />
      </g>
      <g fontFamily="var(--font-mono)" fontSize="8" letterSpacing="1" fill={color}>
        <text x="265" y="38">
          DOCKED / SOYUZ-MS
        </text>
        <text x="345" y="263">
          RADIATOR — AMMONIA LOOP
        </text>
      </g>
    </svg>
  )
}

export function OrbitDiagram({
  size = 280,
  color = 'var(--copper-glow)',
}: {
  size?: number
  color?: string
}) {
  const center = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <defs>
        <radialGradient id="schEarthGlow">
          <stop offset="0%" stopColor="oklch(0.42 0.10 220)" />
          <stop offset="100%" stopColor="oklch(0.10 0.02 220)" />
        </radialGradient>
      </defs>
      {/* Earth */}
      <circle
        cx={center}
        cy={center}
        r="22"
        fill="url(#schEarthGlow)"
        stroke={color}
        strokeWidth="0.6"
      />
      <line
        x1={center - 22}
        y1={center}
        x2={center + 22}
        y2={center}
        stroke={color}
        strokeWidth="0.4"
        opacity="0.5"
      />
      <line
        x1={center}
        y1={center - 22}
        x2={center}
        y2={center + 22}
        stroke={color}
        strokeWidth="0.4"
        opacity="0.5"
      />
      {/* Orbits */}
      <g fill="none" stroke={color} strokeWidth="0.7" opacity="0.7">
        <ellipse cx={center} cy={center} rx={center - 30} ry={center - 50} strokeDasharray="3 3" />
        <ellipse
          cx={center - 10}
          cy={center + 4}
          rx={center - 50}
          ry={center - 30}
          transform={`rotate(35 ${center} ${center})`}
          strokeDasharray="2 4"
        />
        <ellipse
          cx={center + 6}
          cy={center - 4}
          rx={center - 60}
          ry={center - 70}
          transform={`rotate(-25 ${center} ${center})`}
        />
      </g>
      {/* Asteroid markers */}
      <circle cx={center + 100} cy={center - 28} r="4" fill="var(--mcrn)" />
      <circle
        cx={center + 100}
        cy={center - 28}
        r="10"
        fill="none"
        stroke="var(--mcrn)"
        strokeWidth="0.5"
        opacity="0.5"
      >
        <animate attributeName="r" values="6;14;6" dur="2.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0;0.7" dur="2.6s" repeatCount="indefinite" />
      </circle>
      <circle cx={center - 85} cy={center + 45} r="3" fill="var(--amber)" />
      <circle cx={center - 28} cy={center - 88} r="2.5" fill={color} />
      {/* Labels */}
      <g fontFamily="var(--font-mono)" fontSize="8" letterSpacing="1.5" fill={color} opacity="0.9">
        <text x={center + 106} y={center - 24}>
          2025 KP3
        </text>
        <text x={center - 82} y={center + 51}>
          2024 YR4
        </text>
        <text x={center - 20} y={center - 90}>
          419624
        </text>
        <text x={center} y={center + 4} textAnchor="middle" fontSize="8">
          ⊕
        </text>
      </g>
      {/* Corner ticks */}
      <g stroke={color} strokeWidth="0.5" opacity="0.5" fill="none">
        <path d={`M10,10 L10,20 M10,10 L20,10`} />
        <path d={`M${size - 10},10 L${size - 10},20 M${size - 10},10 L${size - 20},10`} />
        <path d={`M10,${size - 10} L10,${size - 20} M10,${size - 10} L20,${size - 10}`} />
        <path
          d={`M${size - 10},${size - 10} L${size - 10},${size - 20} M${size - 10},${size - 10} L${size - 20},${size - 10}`}
        />
      </g>
    </svg>
  )
}

export function SolarWindChart({
  width = 760,
  height = 130,
  color = 'var(--signal)',
}: {
  width?: number
  height?: number
  color?: string
}) {
  const pts1 = Array.from({ length: 60 }, (_, i) => ({
    x: (i / 59) * width,
    y: height / 2 + Math.sin(i * 0.4) * 20 + Math.sin(i * 0.13) * 14,
  }))
  const pts2 = Array.from({ length: 60 }, (_, i) => ({
    x: (i / 59) * width,
    y: height * 0.65 + Math.sin(i * 0.22 + 1) * 18 + Math.cos(i * 0.09) * 10,
  }))

  const path1 = pts1
    .map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join('')
  const path2 = pts2
    .map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join('')
  const fill1 = `${path1} L${width},${height} L0,${height} Z`

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', height }}>
      <defs>
        <linearGradient id="swGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Gridlines */}
      <g stroke={color} strokeWidth="0.4" opacity="0.15" strokeDasharray="2 3">
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1="0" y1={height * p} x2={width} y2={height * p} />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1={(width / 12) * i} y1="0" x2={(width / 12) * i} y2={height} />
        ))}
      </g>
      {/* Bz fill + line */}
      <path d={fill1} fill="url(#swGrad)" />
      <path d={path1} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      {/* Speed line — amber */}
      <path
        d={path2}
        fill="none"
        stroke="var(--amber)"
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeDasharray="4 2"
        opacity="0.85"
      />
      {/* Live cursor */}
      <line
        x1={width - 6}
        y1="0"
        x2={width - 6}
        y2={height}
        stroke={color}
        strokeWidth="0.6"
        opacity="0.6"
        strokeDasharray="2 2"
      />
      <circle cx={width - 6} cy={pts1[pts1.length - 1]?.y ?? 65} r="3" fill={color}>
        <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite" />
      </circle>
      {/* Labels */}
      <g fontFamily="var(--font-mono)" fontSize="9" fill={color} opacity="0.7" letterSpacing="1.5">
        <text x="6" y="12">
          −24H
        </text>
        <text x={width - 6} y="12" textAnchor="end">
          NOW
        </text>
        <text x={width / 2} y="12" textAnchor="middle" fill="var(--amber)" opacity="0.85">
          SPEED KM/S
        </text>
        <text x="6" y={height - 6}>
          BZ NT
        </text>
      </g>
    </svg>
  )
}

export function RociShip({
  size = 380,
  color = 'var(--copper-glow)',
}: {
  size?: number
  color?: string
}) {
  const rivets = [210, 250, 290, 330, 370, 410, 450, 490, 530, 570]
  return (
    <svg width={size} height={size * 0.46} viewBox="0 0 760 350" style={{ display: 'block' }}>
      <defs>
        <filter id="rociGlow">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <linearGradient id="rociHull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.30 0.06 50)" />
          <stop offset="100%" stopColor="oklch(0.14 0.02 50)" />
        </linearGradient>
      </defs>
      <g stroke={color} strokeWidth="1.2" fill="url(#rociHull)" strokeLinejoin="round">
        {/* Nose */}
        <path d="M620,160 L720,170 L740,175 L720,180 L620,190 L580,185 L580,165 Z" />
        {/* PDC turrets */}
        <path d="M555,148 L585,148 L585,160 L555,160 Z" fill="oklch(0.18 0.04 50)" />
        <path d="M555,190 L585,190 L585,202 L555,202 Z" fill="oklch(0.18 0.04 50)" />
        {/* Main body */}
        <path d="M180,150 L580,150 L580,200 L180,200 Z" />
        {/* Fins */}
        <path d="M180,110 L260,150 L180,150 Z" />
        <path d="M180,240 L260,200 L180,200 Z" />
        {/* Engine bell */}
        <path d="M70,140 L180,150 L180,200 L70,210 L40,205 L20,195 L20,155 L40,145 Z" />
        {/* Exhaust glow */}
        <ellipse
          cx="20"
          cy="175"
          rx="14"
          ry="22"
          fill={color}
          opacity="0.4"
          filter="url(#rociGlow)"
        />
        <ellipse cx="14" cy="175" rx="6" ry="14" fill="oklch(0.92 0.05 80)" opacity="0.7" />
      </g>
      {/* Hull plate seams */}
      <g stroke={color} strokeWidth="0.5" opacity="0.55" fill="none">
        {[220, 280, 340, 400, 460, 520].map((x) => (
          <line key={x} x1={x} y1="150" x2={x} y2="200" />
        ))}
        <line x1="180" y1="175" x2="580" y2="175" strokeDasharray="2 3" />
      </g>
      {/* Rivets */}
      <g fill={color} opacity="0.7">
        {rivets.map((x) => (
          <g key={x}>
            <circle cx={x} cy="158" r="1.2" />
            <circle cx={x} cy="192" r="1.2" />
          </g>
        ))}
      </g>
      {/* Hull number */}
      <text
        x="360"
        y="183"
        textAnchor="middle"
        fontFamily="var(--font-stencil)"
        fontSize="22"
        fill={color}
        letterSpacing="3"
        opacity="0.9"
      >
        ROCI / TACHI
      </text>
      {/* Leader callouts */}
      <g stroke={color} strokeWidth="0.5" fill="none" opacity="0.7">
        <path d="M50,170 L50,90 L160,90" />
        <path d="M570,148 L570,80 L680,80" />
        <path d="M260,108 L260,60 L380,60" />
        <path d="M100,260 L100,310 L240,310" />
      </g>
      <g fontFamily="var(--font-mono)" fontSize="9" fill={color} letterSpacing="1.5" opacity="0.9">
        <text x="48" y="86">
          EPSTEIN DRIVE
        </text>
        <text x="572" y="76">
          1×PDC / NOSE
        </text>
        <text x="262" y="56">
          DORSAL FIN — RAD
        </text>
        <text x="102" y="306">
          REACTION MASS PORTS
        </text>
      </g>
      {/* Dimension line */}
      <g stroke={color} strokeWidth="0.5" opacity="0.55" fill="none">
        <line x1="20" y1="280" x2="740" y2="280" strokeDasharray="3 3" />
        <line x1="20" y1="275" x2="20" y2="285" />
        <line x1="740" y1="275" x2="740" y2="285" />
      </g>
      <text
        x="380"
        y="276"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="9"
        fill={color}
        letterSpacing="2"
        opacity="0.8"
      >
        46 m
      </text>
      {/* Corner ticks */}
      <g stroke={color} strokeWidth="0.6" opacity="0.6" fill="none">
        <path d="M10,10 L10,28 M10,10 L28,10" />
        <path d="M750,10 L750,28 M750,10 L732,10" />
        <path d="M10,340 L10,322 M10,340 L28,340" />
        <path d="M750,340 L750,322 M750,340 L732,340" />
      </g>
      <line
        x1="40"
        y1="20"
        x2="720"
        y2="20"
        stroke={color}
        strokeDasharray="1 4"
        strokeWidth="0.4"
        opacity="0.5"
      />
      <g fontFamily="var(--font-mono)" fontSize="8" fill={color} letterSpacing="1.5" opacity="0.75">
        <text x="40" y="16">
          DWG-001 / ROCI / SHEET 3 OF 7
        </text>
        <text x="720" y="16" textAnchor="end">
          SCALE 1:140
        </text>
      </g>
    </svg>
  )
}
