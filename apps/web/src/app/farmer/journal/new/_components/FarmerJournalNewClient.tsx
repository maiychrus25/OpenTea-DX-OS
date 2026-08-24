// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useRouter } from 'next/navigation'
import { FarmerJournalForm } from '../../_components/FarmerJournalForm'
import styles from '../../journal.module.css'

export function FarmerJournalNewClient() {
  const router = useRouter()

  return (
    <main className={styles.container}>
      <FarmerJournalForm
        onSuccess={() => router.push('/farmer/journal')}
        onCancel={() => router.push('/farmer/journal')}
      />
    </main>
  )
}
