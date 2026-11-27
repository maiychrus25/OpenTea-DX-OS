// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import type { InputItem } from '@/lib/ledger/types'
import { AdvanceForm } from './AdvanceForm'
import { HouseholdBankSection } from './HouseholdBankSection'
import { ItemCatalogue } from './ItemCatalogue'
import { TodayAdvances } from './TodayAdvances'
import styles from './ledger.module.css'

/** The accountant's and manager's input desk: items, quick advances, today's list, bank accounts. */
export function InputsPanel() {
  const [items, setItems] = useState<InputItem[]>([])
  const [loadError, setLoadError] = useState('')
  const [revision, setRevision] = useState(0)

  const loadItems = () => fetchJson<{ data: InputItem[] }>('/api/input-items')
    .then(body => { setItems(body.data); setLoadError('') })
    .catch(() => setLoadError(LOAD_FAILED_MESSAGE))

  useEffect(() => { void loadItems() }, [])

  return (
    <>
      {loadError && <p role="alert" className={styles.error}>{loadError}</p>}
      <ItemCatalogue items={items} onChanged={() => { void loadItems() }} />
      <div className={styles.columns}>
        <AdvanceForm items={items.filter(i => i.active)} onSaved={() => setRevision(r => r + 1)} />
        <TodayAdvances revision={revision} />
      </div>
      <HouseholdBankSection />
    </>
  )
}
