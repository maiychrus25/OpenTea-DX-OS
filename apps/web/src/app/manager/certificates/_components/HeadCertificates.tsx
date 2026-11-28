// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Award, BadgeCheck, CalendarDays, CheckCircle2, Download, Eye, FileText, Hash, Hourglass, Landmark, NotebookPen, Plus, Sprout, XCircle } from 'lucide-react'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { CertificatesPanel } from '@/components/features/certificates/CertificatesPanel'
import { Pager, StatCards, Tabs, pageOf } from '@/components/features/manager-web/parts'
import { DetailPanel } from '@/components/features/manager-web/DetailPanel'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import { downloadCsv } from '@/lib/manager/download-csv'
import type { CertificateKind, CertificateView } from '@/lib/certificates/types'
import { dayMonthYear } from '@/lib/weighing/format'

type View = 'ALL' | 'VALID' | 'SOON' | 'OVER'

const KINDS: Record<CertificateKind, string> = { VIETGAP: 'VietGAP', OCOP: 'OCOP', ORGANIC: 'Hữu cơ', OTHER: 'Khác' }
/** A certificate this close to its last day is shown as ending soon. */
const SOON_DAYS = 90

function stateOf(c: CertificateView): Exclude<View, 'ALL'> {
  if (c.status !== 'VALID') return 'OVER'
  return new Date(c.expires_on).getTime() - Date.now() < SOON_DAYS * 24 * 60 * 60 * 1000 ? 'SOON' : 'VALID'
}

const pill = (c: CertificateView) => {
  const state = stateOf(c)
  if (state === 'OVER') return <Pill tone="red">{c.status === 'REVOKED' ? 'Đã thu hồi' : 'Hết hiệu lực'}</Pill>
  return state === 'SOON' ? <Pill tone="amber">Sắp hết hạn</Pill> : <Pill tone="green">Còn hiệu lực</Pill>
}

const range = (c: CertificateView) => `${dayMonthYear(c.issued_on)} – ${dayMonthYear(c.expires_on)}`

/** The cooperative's certificates with the chosen one beside the list. */
export function HeadCertificates() {
  const [items, setItems] = useState<CertificateView[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>('ALL')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [chosenId, setChosenId] = useState('')
  const [managing, setManaging] = useState(false)

  const load = useCallback(() => {
    fetchJson<{ data: CertificateView[] }>('/api/certificates')
      .then((body) => { setItems(body.data); setFailed(false) })
      .catch(() => setFailed(true))
  }, [])
  useEffect(() => { load() }, [load])

  const all = items ?? []
  const count = (key: Exclude<View, 'ALL'>) => all.filter((c) => stateOf(c) === key).length
  // Ending soon is still in force.
  const inForce = count('VALID') + count('SOON')
  const needle = search.trim().toLocaleLowerCase('vi')
  const listed = all.filter((c) =>
    (view === 'ALL' || (view === 'VALID' ? stateOf(c) !== 'OVER' : stateOf(c) === view)) &&
    (!needle || `${c.number} ${KINDS[c.kind]} ${c.issuer}`.toLocaleLowerCase('vi').includes(needle)))
  const paged = pageOf(listed, page, 8)
  const chosen = listed.find((c) => c.id === chosenId) ?? paged.rows[0] ?? null

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Award size={28} />}
        title="Chứng nhận"
        description="Quản lý các chứng nhận chất lượng, an toàn và tiêu chuẩn sản xuất."
        actions={
          <>
            <button type="button" className={kit.primary} onClick={() => setManaging(true)}><Plus size={16} aria-hidden="true" />Thêm chứng nhận</button>
            <button type="button" className={kit.secondary} disabled={listed.length === 0} onClick={() => downloadCsv('chung-nhan.csv', [['Số hiệu', 'Loại', 'Cơ quan cấp', 'Ngày cấp', 'Ngày hết hạn'], ...listed.map((c) => [c.number, KINDS[c.kind], c.issuer, c.issued_on, c.expires_on])])}><Download size={16} aria-hidden="true" />Xuất</button>
          </>
        }
      />
      <StatCards items={[
        { label: 'Tổng chứng nhận', value: String(all.length), icon: <BadgeCheck size={26} /> },
        { label: 'Còn hiệu lực', value: String(inForce), icon: <CheckCircle2 size={26} /> },
        { label: 'Sắp hết hạn', value: String(count('SOON')), icon: <Hourglass size={26} />, note: `Trong ${SOON_DAYS} ngày` },
        { label: 'Hết hiệu lực', value: String(count('OVER')), icon: <XCircle size={26} />, tone: 'red' },
      ]} />
      <div className={ui.bar}>
        <Tabs<View> label="Trạng thái" value={view} onChange={(key) => { setView(key); setPage(1) }} items={[{ key: 'ALL', label: `Tất cả (${all.length})` }, { key: 'VALID', label: `Còn hiệu lực (${inForce})` }, { key: 'SOON', label: `Sắp hết hạn (${count('SOON')})` }, { key: 'OVER', label: `Hết hiệu lực (${count('OVER')})` }]} />
        <input type="search" className={`${ui.control} ${ui.grow}`} aria-label="Tìm chứng nhận" placeholder="Tìm mã, tên chứng nhận..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
      </div>
      <div className={chosen ? ui.split : undefined}>
        <section className={kit.card} aria-label="Danh sách chứng nhận">
          {failed ? <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div> : !items ? <div className={kit.state}>Đang tải chứng nhận...</div> : listed.length === 0 ? <EmptyState icon={<Award />} title="Chưa có chứng nhận nào." /> : (
            <>
              <div className={table.tableWrap}>
                <table className={table.table}>
                  <thead><tr><th>#</th><th>Số hiệu</th><th>Tên chứng nhận</th><th>Cơ quan cấp</th><th>Hiệu lực</th><th>Trạng thái</th><th>Xem</th></tr></thead>
                  <tbody className={ui.rows}>
                    {paged.rows.map((c, index) => (
                      <tr key={c.id} aria-selected={c.id === chosen?.id} onClick={() => setChosenId(c.id)}>
                        <td>{paged.start + index + 1}</td>
                        <td><button type="button" className={ui.link} onClick={() => setChosenId(c.id)}>{c.number}</button></td>
                        <td>{KINDS[c.kind]}</td>
                        <td>{c.issuer}</td>
                        <td>{range(c)}</td>
                        <td>{pill(c)}</td>
                        <td><button type="button" className={ui.small} aria-label={`Xem ${c.number}`} onClick={() => setChosenId(c.id)}><Eye size={14} aria-hidden="true" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={listed.length} unit="chứng nhận" onPage={setPage} />
            </>
          )}
        </section>
        {chosen && (
          <DetailPanel
            title={`Chứng nhận ${KINDS[chosen.kind]}`}
            status={pill(chosen)}
            rows={[
              { icon: <Award size={15} />, label: 'Tên chứng nhận', value: KINDS[chosen.kind] },
              { icon: <Landmark size={15} />, label: 'Cơ quan cấp', value: chosen.issuer },
              { icon: <CalendarDays size={15} />, label: 'Hiệu lực', value: range(chosen) },
              { icon: <Hash size={15} />, label: 'Số hiệu', value: chosen.number },
              { icon: <Sprout size={15} />, label: 'Phạm vi', value: chosen.scope_note || '—' },
              { icon: <NotebookPen size={15} />, label: 'Ghi chú', value: chosen.revoke_reason ? `Thu hồi: ${chosen.revoke_reason}` : '—' },
              { icon: <FileText size={15} />, label: 'Tài liệu đính kèm', value: <a href={`/api/certificates/${chosen.id}/file`} target="_blank" rel="noopener noreferrer">{chosen.file_name} ({(chosen.file_size / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB)</a> },
            ]}
            totalLabel="Ngày hết hạn"
            total={dayMonthYear(chosen.expires_on)}
          >
            <a className={`${ui.small} ${ui.solid}`} href={`/api/certificates/${chosen.id}/file`} target="_blank" rel="noopener noreferrer"><Download size={14} aria-hidden="true" />Mở tệp</a>
            {chosen.status !== 'REVOKED' && <button type="button" className={ui.small} onClick={() => setManaging(true)}>Thu hồi</button>}
          </DetailPanel>
        )}
      </div>
      <Modal isOpen={managing} onClose={() => { setManaging(false); load() }} title="Thêm và thu hồi chứng nhận" size="lg">
        <CertificatesPanel canRevoke />
      </Modal>
    </div>
  )
}
