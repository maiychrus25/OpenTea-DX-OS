// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, FileText, TriangleAlert } from 'lucide-react'
import { FarmerJournalForm } from '../../_components/FarmerJournalForm'
import kit from '@/components/features/farmer-web/kit.module.css'
import type { JournalPrefill } from '../../_components/journal-prefill'
import styles from '../../journal.module.css'
import { fetchJson } from '@/lib/api/fetch-json'

interface Waiting { parcelName: string | null; safeHarvestDate: string | null; status: string }

/** Parcels still inside their withdrawal period, from the harvest schedule of the next 90 days. */
function useWaitingParcels() {
  const [waiting, setWaiting] = useState<Waiting[]>([])
  useEffect(() => {
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setDate(to.getDate() + 90)
    fetchJson<{ data?: Waiting[] }>(`/api/schedule/harvest?start_date=${from.toISOString()}&end_date=${to.toISOString()}`)
      .then(body => setWaiting((body.data ?? []).filter(item => item.safeHarvestDate && new Date(item.safeHarvestDate) > new Date())))
      .catch(() => setWaiting([])) // the warning is extra; the form works without it
  }, [])
  return waiting
}

export function FarmerJournalNewClient({ initial }: { initial?: JournalPrefill }) {
  const router = useRouter()
  const waiting = useWaitingParcels()

  return (
    <div className={kit.page}>
      <div className={kit.hd}>
        <span className={kit.hico}><FileText size={28} aria-hidden="true" /></span>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Ghi nhật ký</h1>
          <p className={kit.sub}>Ghi ngay sau khi làm — gửi cán bộ kỹ thuật duyệt</p>
        </div>
        <Link href="/farmer/journal" className={kit.btn2}><ChevronLeft size={16} aria-hidden="true" />Về nhật ký</Link>
      </div>

      {waiting.length > 0 && (
        <section className={styles.waiting} aria-label="Thửa đang cách ly">
          <TriangleAlert size={18} aria-hidden="true" />
          <strong>Thửa đang cách ly:</strong>
          {waiting.map(item => (
            <span key={item.parcelName}><b className={kit.mono}>{item.parcelName}</b> đến {new Date(item.safeHarvestDate!).toLocaleDateString('vi-VN')}</span>
          ))}
        </section>
      )}

      <div className={styles.formCard}>
        <FarmerJournalForm
          initial={initial}
          onSuccess={() => router.push('/farmer/journal')}
          onCancel={() => router.push('/farmer/journal')}
        />
      </div>
    </div>
  )
}
