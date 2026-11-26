// SPDX-License-Identifier: MIT
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
  sprite: HTMLCanvasElement | null
}

interface Trace {
  x: number
  y: number
  radius: number
  life: number
}

interface Splash {
  x: number
  y: number
  size: number
  age: number
  throwX: number
  throwY: number
}

const SPLASH_SECONDS = 0.34
const TRACE_SECONDS = 2.5
const BACKDROP = '/images/tea-hills-rain.jpg'
/** Where the card's CSS centres the photo vertically, so the drops bend the same part of it. */
const BACKDROP_FOCUS = 0.62

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

/**
 * One drop of water on glass. Like a lens it shows the scene behind it upside down, with a dark rim
 * where light is lost and a bright spot where it is reflected.
 */
function lens(photo: HTMLImageElement, x: number, y: number, radius: number, width: number, height: number): HTMLCanvasElement {
  const ratio = 2
  const size = Math.ceil(radius * 2 * ratio) + 4
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = Math.ceil(size * 1.2)
  const context = sprite.getContext('2d')
  if (!context) return sprite

  const rx = radius * ratio
  const ry = rx * 1.18
  const cx = sprite.width / 2
  const cy = sprite.height / 2
  const cover = Math.max(width / photo.naturalWidth, height / photo.naturalHeight)
  const left = (width - photo.naturalWidth * cover) / 2
  const top = (height - photo.naturalHeight * cover) * BACKDROP_FOCUS
  const reach = radius * 7

  context.beginPath()
  context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  context.clip()
  context.save()
  context.translate(cx, cy)
  context.rotate(Math.PI)
  context.filter = 'brightness(1.3) saturate(1.1)'
  context.drawImage(photo, (x - reach - left) / cover, (y - reach - top) / cover, (reach * 2) / cover, (reach * 2) / cover, -rx, -ry, rx * 2, ry * 2)
  context.restore()

  const rim = context.createRadialGradient(cx, cy - ry * 0.25, rx * 0.35, cx, cy, ry)
  rim.addColorStop(0, 'transparent')
  rim.addColorStop(0.7, 'transparent')
  rim.addColorStop(1, 'black')
  context.globalAlpha = 0.6
  context.fillStyle = rim
  context.fillRect(0, 0, sprite.width, sprite.height)

  context.fillStyle = 'white'
  context.globalAlpha = 0.9
  context.beginPath()
  context.ellipse(cx - rx * 0.32, cy - ry * 0.42, rx * 0.2, rx * 0.15, -0.6, 0, Math.PI * 2)
  context.fill()
  context.globalAlpha = 0.35
  context.beginPath()
  context.ellipse(cx + rx * 0.1, cy + ry * 0.62, rx * 0.5, ry * 0.12, 0, 0, Math.PI * 2)
  context.fill()
  return sprite
}

/** A soft round patch of mist, drawn once and stretched wide. */
function puff(colour: string): HTMLCanvasElement {
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = 128
  const context = sprite.getContext('2d')
  if (!context) return sprite
  const fade = context.createRadialGradient(64, 64, 0, 64, 64, 64)
  fade.addColorStop(0, 'black')
  fade.addColorStop(1, 'transparent')
  context.fillStyle = fade
  context.fillRect(0, 0, 128, 128)
  context.globalCompositeOperation = 'source-in'
  context.fillStyle = colour
  context.fillRect(0, 0, 128, 128)
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
    let traces: Trace[] = []
    let photo: HTMLImageElement | null = null
    const mist = puff(colour)
    let frame = 0
    let last = performance.now()

    const newDrop = (layer: number, y: number): Drop => ({
      x: Math.random() * (width * 1.4) - width * 0.4,
      y,
      layer,
      pace: 0.85 + Math.random() * 0.3,
    })

    const newBead = (y = Math.random() * height): Bead => {
      const x = Math.random() * width
      const radius = 1.4 + Math.random() ** 3 * 5.5
      return { x, y, radius, speed: 0, wait: Math.random() * 10, sprite: photo && lens(photo, x, y, radius, width, height) }
    }

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
      beads = Array.from({ length: Math.round((width * height) / 6500) }, () => newBead())
    }

    const draw = (now: number) => {
      const step = Math.min((now - last) / 1000, 0.05)
      last = now
      const seconds = now / 1000
      const slant = wind * (1 + 0.35 * Math.sin(seconds * 0.7) + 0.2 * Math.sin(seconds * 1.9))
      context.clearRect(0, 0, width, height)
      context.fillStyle = colour
      context.strokeStyle = colour

      // mist rolling through the valleys and thin sheets of rain passing over them
      for (let i = 0; i < 6; i++) {
        const span = width + 640
        const x = ((seconds * (9 + i * 5) + i * 270) % span) - 320
        const y = height * (0.3 + (i % 3) * 0.11) + Math.sin(seconds * 0.4 + i) * 6
        context.globalAlpha = (0.09 + 0.04 * Math.sin(seconds * 0.5 + i * 2)) * intensity
        context.drawImage(mist, x - 220, y - 34, 440, 68)
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
          if (drop.layer > 0 && Math.random() < 0.55) splashes.push({ x: drop.x, y: ground, size: drop.layer, age: 0, throwX: (Math.random() - 0.5) * 22, throwY: 3 + Math.random() * 9 * drop.layer })
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
        // one droplet thrown up, to its own side and height
        context.beginPath()
        context.arc(splash.x + splash.throwX * t, splash.y - Math.sin(t * Math.PI) * splash.throwY, 0.8, 0, Math.PI * 2)
        context.fill()
      }

      // water on the pane: drops sit for a while, heavy ones run down and leave small ones behind
      traces = traces.filter((trace) => trace.life > 0)
      for (const trace of traces) {
        trace.life -= step
        context.globalAlpha = Math.max(trace.life / TRACE_SECONDS, 0) * 0.45
        context.beginPath()
        context.arc(trace.x, trace.y, trace.radius, 0, Math.PI * 2)
        context.fill()
      }

      for (let i = 0; i < beads.length; i++) {
        const bead = beads[i]
        bead.wait -= step
        if (bead.wait < 0 && bead.radius > 3) {
          // water sticks and slips, so the speed jumps instead of growing smoothly
          bead.speed = Math.random() < 0.04 ? Math.random() * 25 : Math.min(bead.speed + 90 * step, 130)
          bead.y += bead.speed * step
          bead.x += (Math.random() - 0.5) * bead.speed * step * 0.35
          if (Math.random() < bead.speed * step * 0.14) {
            traces.push({ x: bead.x, y: bead.y - bead.radius * 1.4, radius: 0.6 + Math.random() * 1.1, life: TRACE_SECONDS })
          }
        }
        if (bead.sprite) {
          context.globalAlpha = 0.95
          context.drawImage(bead.sprite, bead.x - bead.sprite.width / 4, bead.y - bead.sprite.height / 4, bead.sprite.width / 2, bead.sprite.height / 2)
        }
        if (bead.y > height + 8) beads[i] = newBead(Math.random() * height * 0.3)
      }

      frame = requestAnimationFrame(draw)
    }

    resize()
    const backdrop = new Image()
    backdrop.onload = () => {
      photo = backdrop
      resize() // now the drops have something to bend
    }
    backdrop.src = BACKDROP
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(canvas)
    frame = requestAnimationFrame(draw)
    return () => {
      backdrop.onload = null
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [code, windSpeed])

  return <canvas ref={ref} className={styles.rain} aria-hidden="true" />
}
