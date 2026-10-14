import { memo, useEffect, useRef } from 'react'

import { AURORA_HEX, withAlpha } from '@/lib/palette'

import { project } from '../useGlobeProjection'

/** Aurora intensity (0-29) sets the alpha; the hue is the one aurora green (owner pick). */
function auroraFill(intensity: number): string {
  return withAlpha(AURORA_HEX, Math.min(0.45, 0.07 + intensity / 70))
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
      ctx.fillStyle = auroraFill(intensity)
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
