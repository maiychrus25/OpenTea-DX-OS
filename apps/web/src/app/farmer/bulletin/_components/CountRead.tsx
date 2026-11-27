// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useEffect, useRef } from 'react'
import { OPENED_KEY } from './news-data'

/** Counts one more read of an article in this browser, which the most-read list adds up. */
export function CountRead({ id }: { id: string }) {
  // The development server runs effects twice; one visit is still one read.
  const counted = useRef<string | null>(null)
  useEffect(() => {
    if (counted.current === id) return
    counted.current = id
    try {
      const opened = JSON.parse(window.localStorage.getItem(OPENED_KEY) ?? '{}')
      window.localStorage.setItem(OPENED_KEY, JSON.stringify({ ...opened, [id]: (opened[id] ?? 0) + 1 }))
    } catch {
      // storage blocked: the read is not counted
    }
  }, [id])
  return null
}
