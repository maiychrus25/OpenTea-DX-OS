// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React from 'react'
import styles from '../lot-detail.module.css'

const STEPS = [
  'Thông tin cơ bản',
  'Nguồn gốc vùng trồng',
  'Phương pháp canh tác',
  'Kết quả nghiệm thu',
  'Pre-review & hoàn thiện',
  'Xuất QR'
]

export function StepTrack() {
  const currentStep = 5 // Step 5 is active (1-indexed)

  return (
    <div className={styles.stepTrack}>
      {STEPS.map((label, index) => {
        const stepNum = index + 1
        let stepClass = styles.step
        if (stepNum < currentStep) stepClass += ` ${styles.done}`
        else if (stepNum === currentStep) stepClass += ` ${styles.active}`

        return (
          <div key={stepNum} className={stepClass}>
            <div className={styles.stepIcon}>
              {stepNum < currentStep ? '✓' : stepNum}
            </div>
            <span>{stepNum}. {label}</span>
          </div>
        )
      })}
    </div>
  )
}
