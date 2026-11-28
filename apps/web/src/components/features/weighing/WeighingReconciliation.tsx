// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import styles from './weighing.module.css'

interface Summary {
  ticket_net_kg: number
  journal_fresh_leaf_kg: number
}

const kg = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })

/** Weighed kg against the harvest journal's kg for one harvested flush. */
export function WeighingReconciliation({ cycleId }: { cycleId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setSummary(null)
    setError('')
    fetchJson<{ data: Summary }>(`/api/cycles/${cycleId}/weighing-summary`)
      .then(body => setSummary(body.data))
      .catch(() => setError(LOAD_FAILED_MESSAGE))
  }, [cycleId])

  if (error) return <p role="alert" className={styles.error}>{error}</p>
  if (!summary) return <p className={kit.muted}>Đang tải đối chiếu...</p>

  return (
    <div className={styles.reconcile} aria-label="Đối chiếu thu hái">
      <p><strong>Cân thực tế {kg(summary.ticket_net_kg)} kg / Nhật ký {kg(summary.journal_fresh_leaf_kg)} kg</strong></p>
      {summary.ticket_net_kg === 0 && summary.journal_fresh_leaf_kg === 0 && (
        <p className={kit.muted}>Chưa có phiếu cân hay nhật ký thu hái cho lứa này.</p>
      )}
    </div>
  )
}
