export function formatKm(km: number): string {
  if (km >= 1_000_000) return `${(km / 1_000_000).toFixed(2)}M km`
  if (km >= 1_000) return `${(km / 1_000).toFixed(1)}K km`
  return `${km.toFixed(0)} km`
}

export function formatLunarDistance(ld: number): string {
  return `${ld.toFixed(2)} LD`
}

export function formatAu(au: number): string {
  return `${au.toFixed(4)} AU`
}

export function formatVelocity(kps: number): string {
  return `${kps.toFixed(1)} km/s`
}

export function formatDiameter(minKm: number, maxKm: number): string {
  const avg = (minKm + maxKm) / 2
  if (avg >= 1) return `~${avg.toFixed(1)} km`
  return `~${(avg * 1000).toFixed(0)} m`
}

export function formatKt(kt: string | null | undefined): string {
  if (kt == null || kt === '') return '—'
  const n = parseFloat(kt)
  if (isNaN(n)) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1)} Mt`
  return `${n.toFixed(1)} kt`
}

export function formatDateUtc(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  } catch {
    return iso
  }
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  const m = Math.floor(diff / 60_000)
  return m <= 0 ? 'just now' : `${m}m ago`
}

export function formatPalermo(ps: string | undefined): string {
  if (!ps) return '—'
  const n = parseFloat(ps)
  if (isNaN(n)) return '—'
  return n.toFixed(2)
}

export function formatImpactProbability(ip: string | undefined): string {
  if (!ip) return '—'
  const n = parseFloat(ip)
  if (isNaN(n)) return '—'
  if (n < 0.0001) return `${(n * 100).toExponential(1)}%`
  return `${(n * 100).toFixed(4)}%`
}
