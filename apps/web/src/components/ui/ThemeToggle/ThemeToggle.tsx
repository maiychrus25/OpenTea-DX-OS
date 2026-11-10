// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { applyTheme, readStoredTheme, type ThemeChoice } from './theme'
import styles from './ThemeToggle.module.css'

const NEXT: Record<ThemeChoice, ThemeChoice> = { light: 'dark', dark: 'system', system: 'light' }
const LABEL: Record<ThemeChoice, string> = { light: 'Sáng', dark: 'Tối', system: 'Theo hệ thống' }
const ICON = { light: Sun, dark: Moon, system: Monitor }

export function ThemeToggle({ className }: { className?: string }) {
  // Starts as 'system' on server and client alike, then reads storage, so hydration never mismatches.
  const [choice, setChoice] = useState<ThemeChoice>('system')
  useEffect(() => setChoice(readStoredTheme()), [])

  const Icon = ICON[choice]
  const next = NEXT[choice]

  return (
    <button
      type="button"
      className={`${styles.toggle} ${className ?? ''}`}
      aria-label={`Giao diện: ${LABEL[choice]}. Chuyển sang ${LABEL[next]}`}
      title={`Giao diện: ${LABEL[choice]}`}
      onClick={() => {
        applyTheme(next)
        setChoice(next)
      }}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  )
}
