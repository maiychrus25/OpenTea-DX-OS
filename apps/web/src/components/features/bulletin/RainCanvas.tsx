// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useRef } from 'react'
import styles from './weather.module.css'

interface Drop {
  x: number
  y: number
  layer: number
  pace: number
}

interface Bead {
  x: number
  y: number
  radius: number
  speed: number
  wait: number
}

interface Splash {
  x: number
  y: number
  size: number
  age: number
}

const SPLASH_SECONDS = 0.34

// far, middle and near rain; spacing is square pixels of card per drop
const LAYERS = [
  { spacing: 750, speed: 560, length: 13, width: 0.8, alpha: 0.3, ground: 0.74 },
  { spacing: 2100, speed: 920, length: 26, width: 1.2, alpha: 0.48, ground: 0.86 },
  { spacing: 11000, speed: 1450, length: 54, width: 2, alpha: 0.6, ground: 0.97 },
]

function streak(colour: string, length: number, width: number): HTMLCanvasElement {
  const sprite = document.createElement('canvas')
  const scale = 3
  sprite.width = Math.ceil(width * scale)
  sprite.height = length * scale
  const context = sprite.getContext('2d')
  if (!context) return sprite
  context.fillStyle = colour
  const slices = 18
  for (let i = 0; i < slices; i++) {
    const near = (i + 1) / slices
    context.globalAlpha = near ** 1.8
    const w = sprite.width * (0.4 + 0.6 * near)
    context.fillRect((sprite.width - w) / 2, (sprite.height * i) / slices, w, sprite.height / slices + 1)
  }
  return sprite
}

/** How much rain a WMO weather code means: drizzle, rain, or a downpour. */
export function rainIntensity(code: number): number {
  if (code >= 51 && code <= 57) return 0.45
  if (code === 61 || code === 80) return 0.7
  if (code === 65 || code === 67 || code === 82 || code >= 95) return 1.5
  return 1
}

/** Falling rain with depth: three layers, wind gusts, splash rings, mist and water running down the pane. */
export function RainCanvas({ code, windSpeed }: { code: number; windSpeed: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const context = canvas.getContext('2d')
    if (!context) return

    const colour = getComputedStyle(canvas).color
    const intensity = rainIntensity(code)
    const wind = Math.min(windSpeed, 40) / 110 + 0.07
    // Each streak is drawn once with a fading tail, then stamped, which keeps thousands of drops cheap.
    const sprites = LAYERS.map((layer) => streak(colour, layer.length, layer.width))
    let width = 0
    let height = 0
    let drops: Drop[] = []
    let beads: Bead[] = []
    let splashes: Splash[] = []
    let frame = 0
    let last = performance.now()

    const newDrop = (layer: number, y: number): Drop => ({
      x: Math.random() * (width * 1.4) - width * 0.4,
      y,
      layer,
      pace: 0.85 + Math.random() * 0.3,
    })

    const newBead = (): Bead => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.8 + Math.random() ** 2 * 2.6,
      speed: 0,
      wait: Math.random() * 8,
    })

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * ratio
      canvas.height = height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      drops = LAYERS.flatMap((layer, i) =>
        Array.from({ length: Math.round(((width * height) / layer.spacing) * intensity) }, () => newDrop(i, Math.random() * height))
      )
      beads = Array.from({ length: Math.round((width * height) / 9000) }, newBead)
    }

    const draw = (now: number) => {
      const step = Math.min((now - last) / 1000, 0.05)
      last = now
      const seconds = now / 1000
      const slant = wind * (1 + 0.35 * Math.sin(seconds * 0.7) + 0.2 * Math.sin(seconds * 1.9))
      context.clearRect(0, 0, width, height)
      context.fillStyle = colour
      context.strokeStyle = colour

      // thin sheets of rain drifting across the hills
      for (let i = 0; i < 3; i++) {
        const x = ((seconds * (26 + i * 17) + i * 430) % (width + 500)) - 250
        context.save()
        context.translate(x, height * (0.35 + i * 0.18))
        context.scale(3.2, 1)
        for (let ring = 4; ring > 0; ring--) {
          context.globalAlpha = 0.012 * intensity
          context.beginPath()
          context.arc(0, 0, ring * 18, 0, Math.PI * 2)
          context.fill()
        }
        context.restore()
      }

      for (const drop of drops) {
        const layer = LAYERS[drop.layer]
        const fall = layer.speed * drop.pace * step
        drop.y += fall
        drop.x += fall * slant
        context.save()
        context.translate(drop.x, drop.y)
        context.rotate(-Math.atan(slant))
        context.globalAlpha = layer.alpha
        context.drawImage(sprites[drop.layer], -layer.width / 2, -layer.length, layer.width, layer.length)
        context.restore()

        // nearer rain reaches the lower ground and splashes, distant rain ends higher up
        const ground = height * layer.ground + (drop.pace - 1) * 120
        if (drop.y > ground) {
          if (drop.layer > 0 && Math.random() < 0.55) splashes.push({ x: drop.x, y: ground, size: drop.layer, age: 0 })
          Object.assign(drop, newDrop(drop.layer, -Math.random() * 80))
        }
      }

      splashes = splashes.filter((splash) => splash.age < SPLASH_SECONDS)
      context.lineWidth = 0.8
      for (const splash of splashes) {
        splash.age += step
        const t = Math.min(splash.age / SPLASH_SECONDS, 1)
        context.globalAlpha = (1 - t) * 0.55
        context.beginPath()
        context.ellipse(splash.x, splash.y, (2 + t * 7) * splash.size * 0.7, (0.7 + t * 2) * splash.size * 0.7, 0, 0, Math.PI * 2)
        context.stroke()
        for (const side of [-1, 1]) {
          context.beginPath()
          context.arc(splash.x + side * t * 8, splash.y - Math.sin(t * Math.PI) * 7 * splash.size * 0.6, 0.9, 0, Math.PI * 2)
          context.fill()
        }
      }

      // water on the pane: beads sit for a while, then the heavier ones run down
      for (const bead of beads) {
        bead.wait -= step
        if (bead.wait < 0 && bead.radius > 1.8) {
          bead.speed = Math.min(bead.speed + 60 * step, 90)
          const move = bead.speed * step * (0.4 + Math.random())
          bead.y += move
          context.globalAlpha = 0.16
          context.lineWidth = bead.radius * 0.9
          context.beginPath()
          context.moveTo(bead.x, bead.y)
          context.lineTo(bead.x, bead.y - Math.min(bead.speed * 0.35, 26))
          context.stroke()
        }
        context.globalAlpha = 0.2
        context.beginPath()
        context.ellipse(bead.x, bead.y, bead.radius, bead.radius * 1.2, 0, 0, Math.PI * 2)
        context.fill()
        context.globalAlpha = 0.75
        context.beginPath()
        context.arc(bead.x - bead.radius * 0.3, bead.y - bead.radius * 0.4, bead.radius * 0.32, 0, Math.PI * 2)
        context.fill()
        if (bead.y > height + 5) Object.assign(bead, newBead(), { y: Math.random() * height * 0.3 })
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
