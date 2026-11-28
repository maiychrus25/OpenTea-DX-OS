// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import { WeighingForm } from './WeighingForm'
import { TodayTickets } from './TodayTickets'
import styles from './weighing.module.css'

/** The weighing form, with today's tickets beside it on wide screens and under it on phones. */
export function WeighingStation({ printBase }: { printBase?: string } = {}) {
  const [revision, setRevision] = useState(0)
  return (
    <div className={styles.station}>
      <WeighingForm printBase={printBase} onSaved={() => setRevision(r => r + 1)} />
      <TodayTickets revision={revision} />
    </div>
  )
}
