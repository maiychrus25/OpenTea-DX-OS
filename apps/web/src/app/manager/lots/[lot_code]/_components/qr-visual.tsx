// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React from 'react'
import styles from '../lot-detail.module.css'

export function QrVisual() {
  // Generate a random-looking 11x11 grid pattern for the placeholder
  const dots = Array.from({ length: 121 }).map((_, i) => {
    // Make corners look like QR markers
    const isMarker = 
      (i % 11 < 3 && Math.floor(i / 11) < 3) || // top-left
      (i % 11 > 7 && Math.floor(i / 11) < 3) || // top-right
      (i % 11 < 3 && Math.floor(i / 11) > 7)    // bottom-left

    const isDot = isMarker || Math.random() > 0.5
    return isDot
  })

  return (
    <div className={styles.qrVisual}>
      {dots.map((isDot, i) => (
        <div key={i} className={isDot ? styles.qrDot : styles.qrEmpty} />
      ))}
    </div>
  )
}
