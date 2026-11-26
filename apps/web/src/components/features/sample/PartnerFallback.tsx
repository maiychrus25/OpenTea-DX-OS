// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { SamplePartners } from './SampleLists'

/** The design's example partners, only when the cooperative has saved none. */
export function PartnerFallback() {
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/partners')
        if (!res.ok) return
        const json = await res.json()
        const list = Array.isArray(json) ? json : json.data ?? []
        setEmpty(list.length === 0)
      } catch {
        // The map already reports a failed load.
      }
    }
    void check()
  }, [])

  return empty ? <SamplePartners /> : null
}
