// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React from 'react'
import styles from './SegmentedFilter.module.css'

export interface SegmentOption {
  value: string
  label: string
  count?: number
}

export interface SegmentedFilterProps {
  label: string
  options: SegmentOption[]
  value: string
  onChange: (value: string) => void
}

export function SegmentedFilter({ label, options, value, onChange }: SegmentedFilterProps) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={`${styles.segment} ${option.value === value ? styles.selected : ''}`.trim()}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.count == null ? option.label : `${option.label} · ${option.count.toLocaleString('vi-VN')}`}
        </button>
      ))}
    </div>
  )
}
