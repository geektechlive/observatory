import { useEffect, useRef } from 'react'

import { useReducedMotion } from '@/hooks/useReducedMotion'
import { STAR_HEX } from '@/lib/palette'

import styles from './starfield-canvas.module.css'

interface Star {
  x: number
  y: number
  r: number
  baseAlpha: number
  period: number
  phase: number
  dx: number
  dy: number
  warm: boolean
}

function generateStars(count: number, w: number, h: number): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    const tier = Math.random()
    const r = tier < 0.6 ? 0.9 : tier < 0.9 ? 1.4 : 2.2
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r,
      baseAlpha: 0.55 + Math.random() * 0.45,
      period: 4000 + Math.random() * 8000,
      phase: Math.random() * Math.PI * 2,
      dx: 0.22,
      dy: 0.1,
      warm: Math.random() < 0.7,
    })
  }
  return stars
}

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio ?? 1
    let w = window.innerWidth
    let h = window.innerHeight

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.resetTransform()
      ctx.scale(dpr, dpr)
    }
    resize()

    let stars = generateStars(500, w, h)

    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h)
      for (const star of stars) {
        if (!reducedMotion) {
          star.x = (star.x + star.dx + w) % w
          star.y = (star.y + star.dy + h) % h
        }
        const tw = Math.sin((now * Math.PI * 2) / star.period + star.phase)
        ctx.globalAlpha = star.baseAlpha * (0.6 + 0.4 * tw)
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
        ctx.fillStyle = star.warm ? STAR_HEX.warm : STAR_HEX.cool
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const TARGET_MS = 1000 / 18
    let lastTs = 0
    let rafId = 0

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick)
      if (now - lastTs < TARGET_MS) return
      lastTs = now
      draw(now)
    }
    // Under reduced motion the field is one still frame, redrawn only on resize.
    if (reducedMotion) draw(0)
    else rafId = requestAnimationFrame(tick)

    let resizeTimer: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        resize()
        stars = generateStars(500, w, h)
        if (reducedMotion) draw(0)
      }, 200)
    }

    // Attached in both paths: the reduced-motion frame used to go stale after a resize.
    const ro = new ResizeObserver(onResize)
    ro.observe(document.documentElement)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      clearTimeout(resizeTimer)
    }
  }, [reducedMotion])

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
}
