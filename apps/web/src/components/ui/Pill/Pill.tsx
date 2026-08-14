// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import styles from './Pill.module.css'

export interface PillProps {
  tone: 'green' | 'amber' | 'blue' | 'neutral'
  size?: 'sm' | 'md'
  children: React.ReactNode
  className?: string
}

export function Pill({ tone, size = 'sm', children, className }: PillProps) {
  return (
    <span className={`${styles.pill} ${styles[tone]} ${styles[size]} ${className ?? ''}`.trim()}>
      {children}
    </span>
  )
}
