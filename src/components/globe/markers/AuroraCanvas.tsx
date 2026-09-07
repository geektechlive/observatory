import { memo, useEffect, useRef } from 'react'

import { project } from '../useGlobeProjection'

/** Aurora intensity (0-29) → glow color at the given alpha. */
function auroraRgba(intensity: number, a: number): string {
  if (intensity >= 22) return `rgba(255,90,200,${a})`
  if (intensity >= 14) return `rgba(180,255,120,${a})`
  if (intensity >= 8) return `rgba(90,255,170,${a})`
  return `rgba(60,220,150,${a})`
}

interface AuroraCanvasProps {
  /** OVATION aurora — [lon, lat, intensity] triplets. */
  aurora: readonly [number, number, number][]
  rotation: number
  R: number
  center: number
  size: number
}

/** OVATION aurora oval — canvas overlay, projected with the live rotation. */
export const AuroraCanvas = memo(function AuroraCanvas({
  aurora,
  rotation,
  R,
  center,
  size,
}: AuroraCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr
      canvas.height = size * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    if (aurora.length === 0) return
    ctx.save()
    ctx.beginPath()
    ctx.arc(center, center, R, 0, Math.PI * 2)
    ctx.clip()
    ctx.globalCompositeOperation = 'lighter'
    for (const [lon, lat, intensity] of aurora) {
      const p = project(lat, lon, rotation, R)
      if (!p.visible) continue
      ctx.fillStyle = auroraRgba(intensity, Math.min(0.45, 0.07 + intensity / 70))
      ctx.beginPath()
      ctx.arc(center + p.x, center + p.y, 5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }, [aurora, rotation, R, center, size])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: size,
        height: size,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  )
})
