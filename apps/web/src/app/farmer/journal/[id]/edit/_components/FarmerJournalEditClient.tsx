// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, FileText } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import styles from '../../../journal.module.css'
import { FarmerJournalForm, type EditableEntry } from '../../../_components/FarmerJournalForm'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'missing' } | { kind: 'ready'; entry: EditableEntry }

export function FarmerJournalEditClient({ id }: { id: string }) {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    fetchJson<{ data?: EditableEntry[] }>('/api/journal')
      .then(body => {
        const entry = (body.data ?? []).find(item => item.id === id)
        setState(entry ? { kind: 'ready', entry } : { kind: 'missing' })
      })
      .catch(() => setState({ kind: 'failed' }))
  }, [id])

  const confirming = state.kind === 'ready' && state.entry.status === 'DRAFT'
  const back = () => router.push('/farmer/journal')

  return (
    <div className={kit.page}>
      <div className={kit.hd}>
        <span className={kit.hico}><FileText size={28} aria-hidden="true" /></span>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>{confirming ? 'Xác nhận đã phun' : 'Sửa lại nhật ký'}</h1>
          <p className={kit.sub}>{confirming ? 'Kiểm tra ngày phun và liều lượng rồi gửi cán bộ duyệt.' : 'Chỉnh theo yêu cầu của cán bộ rồi gửi lại.'}</p>
        </div>
        <Link href="/farmer/journal" className={kit.btn2}><ChevronLeft size={16} aria-hidden="true" />Về nhật ký</Link>
      </div>

      <div className={styles.formCard}>
        {state.kind === 'loading' && <p className={styles.empty}>Đang tải...</p>}
        {state.kind === 'failed' && <p className={styles.empty}>{LOAD_FAILED_MESSAGE}</p>}
        {state.kind === 'missing' && <p className={styles.empty}>Không tìm thấy nhật ký này.</p>}
        {state.kind === 'ready' && <FarmerJournalForm entry={state.entry} onSuccess={back} onCancel={back} />}
      </div>
    </div>
  )
}
