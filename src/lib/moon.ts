// Moon-phase rendering helpers. The lit region is built by sampling the limb
// and terminator at each y, so there is no SVG arc-flag ambiguity — correct for
// every phase from new to full, waxing or waning.

/** Is the moon waxing (lit limb on the right, N-hemisphere convention)? */
export function isWaxing(phaseName: string): boolean {
  const n = phaseName.toLowerCase()
  if (n.includes('waning') || n.includes('last quarter') || n.includes('third quarter')) {
    return false
  }
  return true
}

/**
 * SVG path for the illuminated portion of a moon disc of radius R centered at
 * (0,0). `fraction` is the illuminated fraction 0..1. The terminator ellipse has
 * signed semi-axis (1 - 2f)·√(R²−y²): f=0 → none, f=0.5 → half, f=1 → full disc.
 */
export function moonLitPath(R: number, fraction: number, waxing: boolean, n = 32): string {
  const f = Math.min(1, Math.max(0, fraction))
  const sign = waxing ? 1 : -1
  const pts: [number, number][] = []

  // Lit limb (outer edge), top → bottom.
  for (let i = 0; i <= n; i++) {
    const y = -R + (2 * R * i) / n
    const x = sign * Math.sqrt(Math.max(0, R * R - y * y))
    pts.push([x, y])
  }
  // Terminator, bottom → top.
  for (let i = n; i >= 0; i--) {
    const y = -R + (2 * R * i) / n
    const xt = sign * (1 - 2 * f) * Math.sqrt(Math.max(0, R * R - y * y))
    pts.push([xt, y])
  }

  return 'M' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L') + 'Z'
}
