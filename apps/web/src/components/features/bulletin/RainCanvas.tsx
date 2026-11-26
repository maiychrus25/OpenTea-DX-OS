// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useRef } from 'react'
import styles from './weather.module.css'

interface Drop {
  x: number
  y: number
  depth: number
}

interface Splash {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

const SPLASH_SECONDS = 0.28
const GRAVITY = 700

/** How much rain a WMO weather code means: drizzle, rain, or a downpour. */
export function rainIntensity(code: number): number {
  if (code >= 51 && code <= 57) return 0.45
  if (code === 61 || code === 80) return 0.7
  if (code === 65 || code === 67 || code === 82 || code >= 95) return 1.5
  return 1
}

/** Falling rain with depth, wind slant and splashes. Stays still for people who ask for less motion. */
export function RainCanvas({ code, windSpeed }: { code: number; windSpeed: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const context = canvas.getContext('2d')
    if (!context) return

    const colour = getComputedStyle(canvas).color
    const intensity = rainIntensity(code)
    const slant = Math.min(windSpeed, 40) / 110 + 0.05
    let width = 0
    let height = 0
    let drops: Drop[] = []
    let splashes: Splash[] = []
    let frame = 0
    let last = performance.now()

    const newDrop = (y: number): Drop => ({
      x: Math.random() * (width * 1.3) - width * 0.3,
      y,
      depth: Math.random() ** 1.6, // most drops are far away
    })

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * ratio
      canvas.height = height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const count = Math.round(((width * height) / 1400) * intensity)
      drops = Array.from({ length: count }, () => newDrop(Math.random() * height))
    }

    const draw = (now: number) => {
      const step = Math.min((now - last) / 1000, 0.05)
      last = now
      context.clearRect(0, 0, width, height)
      context.strokeStyle = colour
      context.fillStyle = colour
      context.lineCap = 'round'

      for (const drop of drops) {
        const speed = 520 + drop.depth * 900
        const length = 8 + drop.depth * 26
        drop.y += speed * step
        drop.x += speed * slant * step
        context.globalAlpha = 0.12 + drop.depth * 0.42
        context.lineWidth = 0.5 + drop.depth * 1.1
        context.beginPath()
        context.moveTo(drop.x, drop.y)
        context.lineTo(drop.x - length * slant, drop.y - length)
        context.stroke()

        // near drops reach the lower ground and splash, far ones vanish higher up
        const ground = height * (0.8 + drop.depth * 0.2)
        if (drop.y > ground) {
          if (drop.depth > 0.5) {
            for (let i = 0; i < 2; i++) {
              splashes.push({ x: drop.x, y: ground, vx: (Math.random() - 0.5) * 110, vy: -50 - Math.random() * 80, life: SPLASH_SECONDS })
            }
          }
          Object.assign(drop, newDrop(-Math.random() * 60))
        }
      }

      splashes = splashes.filter((splash) => splash.life > 0)
      for (const splash of splashes) {
        splash.life -= step
        splash.vy += GRAVITY * step
        splash.x += splash.vx * step
        splash.y += splash.vy * step
        context.globalAlpha = Math.max(splash.life / SPLASH_SECONDS, 0) * 0.6
        context.beginPath()
        context.arc(splash.x, splash.y, 1, 0, Math.PI * 2)
        context.fill()
      }

      frame = requestAnimationFrame(draw)
    }

    resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(canvas)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [code, windSpeed])

  return <canvas ref={ref} className={styles.rain} aria-hidden="true" />
}
