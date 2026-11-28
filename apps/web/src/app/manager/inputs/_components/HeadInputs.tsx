// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, Boxes, CalendarCheck, CalendarDays, Clock, Eye, Layers, Package, Pencil, Plus, Repeat } from 'lucide-react'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { AdvanceForm } from '@/components/features/ledger/AdvanceForm'
import { HouseholdBankSection } from '@/components/features/ledger/HouseholdBankSection'
import { ItemCatalogue, KIND_LABELS } from '@/components/features/ledger/ItemCatalogue'
import { TodayAdvances } from '@/components/features/ledger/TodayAdvances'
import { Pager, Sample, StatCards, Tabs, pageOf } from '@/components/features/manager-web/parts'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import { localDay } from '@/domain/shared/local-day'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import type { AdvancePage, InputItem } from '@/lib/ledger/types'
import { dayMonthYear } from '@/lib/weighing/format'
import styles from './inputs.module.css'

type View = 'ALL' | InputItem['kind'] | 'BIO'
type Dialog = 'items' | 'advance' | 'history' | 'bank' | null

const number = (value: number | string) => Number(value).toLocaleString('vi-VN')
const TONES = { FERTILIZER: 'blue', PESTICIDE: 'green', OTHER: 'neutral' } as const
/** The system keeps no stock yet: these figures only fill the design's columns and are marked as examples. */
const SAMPLE_STOCK = [[20, 50], [120, 30], [15, 50], [200, 50]]

/** The cooperative's input items and what was handed out to households. */
export function HeadInputs() {
  const [items, setItems] = useState<InputItem[] | null>(null)
  const [advances, setAdvances] = useState<AdvancePage | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>('ALL')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [opened, setOpened] = useState<InputItem | null>(null)
  const [revision, setRevision] = useState(0)

  const loadItems = useCallback(() => {
    fetchJson<{ data: InputItem[] }>('/api/input-items')
      .then((body) => { setItems(body.data); setFailed(false) })
      .catch(() => setFailed(true))
  }, [])
  useEffect(() => { loadItems() }, [loadItems])
  useEffect(() => {
    const today = localDay(new Date())
    fetchJson<AdvancePage>(`/api/input-advances?from=${today.slice(0, 8)}01&to=${today}`)
      .then(setAdvances)
      .catch(() => setAdvances(null))
  }, [revision])

  const all = items ?? []
  const handed = (advances?.data ?? []).filter((a) => a.status === 'VALID')
  const needle = search.trim().toLocaleLowerCase('vi')
  const listed = all.filter((item) => (view === 'ALL' || item.kind === view) && (!needle || item.name.toLocaleLowerCase('vi').includes(needle)))
  const paged = pageOf(listed, page, 8)
  const count = (kind: InputItem['kind']) => all.filter((item) => item.kind === kind).length
  const close = () => { setDialog(null); loadItems(); setRevision((r) => r + 1) }

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Boxes size={28} />}
        title="Vật tư"
        description="Quản lý tồn kho, cấp phát và theo dõi sử dụng vật tư phục vụ sản xuất."
        actions={
          <>
            <button type="button" className={kit.primary} onClick={() => setDialog('items')}><Plus size={16} aria-hidden="true" />Nhập vật tư</button>
            <button type="button" className={kit.secondary} onClick={() => setDialog('advance')}><Repeat size={16} aria-hidden="true" />Cấp phát</button>
          </>
        }
      />

      <StatCards items={[
        { label: 'Tổng vật tư', value: `${all.length} loại`, icon: <Package size={26} /> },
        { label: 'Tồn kho', value: '6.420 đơn vị', icon: <Layers size={26} />, sample: true },
        { label: 'Sắp hết', value: '4 loại', icon: <AlertTriangle size={26} />, tone: 'amber', sample: true },
        { label: 'Đã cấp tháng này', value: `${handed.length} lượt`, icon: <CalendarCheck size={26} /> },
      ]} />

      <p className={styles.alert}>
        <AlertTriangle size={18} aria-hidden="true" />
        <span><Sample /> <strong>Có 4 vật tư sắp hết:</strong> NPK 16-16-8 (20 kg), Trichoderma (8 kg), Ridomil Gold (10 gói), Hữu cơ vi sinh (15 lít).</span>
      </p>

      <div className={ui.bar}>
        <Tabs<View>
          label="Nhóm vật tư"
          value={view}
          onChange={(key) => { setView(key); setPage(1) }}
          items={[
            { key: 'ALL', label: `Tất cả (${all.length})` },
            { key: 'FERTILIZER', label: `Phân bón (${count('FERTILIZER')})` },
            { key: 'PESTICIDE', label: `Thuốc BVTV (${count('PESTICIDE')})` },
            { key: 'BIO', label: 'Chế phẩm SH (Mẫu)' },
            { key: 'OTHER', label: `Khác (${count('OTHER')})` },
          ]}
        />
        <input type="search" className={`${ui.control} ${ui.grow}`} aria-label="Tìm vật tư" placeholder="Tìm tên vật tư..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
      </div>

      <div className={styles.columns}>
        <section className={kit.card} aria-label="Danh sách vật tư">
          {failed ? <div className={kit.state}>{LOAD_FAILED_MESSAGE}</div> : !items ? <div className={kit.state}>Đang tải...</div> : listed.length === 0 ? (
            <EmptyState icon={<Package />} title={view === 'BIO' ? 'Chưa có nhóm chế phẩm sinh học.' : 'Chưa có vật tư nào theo bộ lọc này.'} />
          ) : (
            <>
              <div className={table.tableWrap}>
                <table className={`${table.table} ${styles.tight}`}>
                  <thead>
                    <tr><th>#</th><th>Tên vật tư</th><th>Nhóm</th><th>Đơn vị</th><th>Tồn kho <Sample /></th><th>Ngưỡng cảnh báo <Sample /></th><th>Trạng thái</th><th>Thao tác</th></tr>
                  </thead>
                  <tbody>
                    {paged.rows.map((item, index) => {
                      const [stock, floor] = SAMPLE_STOCK[(paged.start + index) % SAMPLE_STOCK.length]
                      return (
                        <tr key={item.id}>
                          <td>{paged.start + index + 1}</td>
                          <td><strong>{item.name}</strong></td>
                          <td><Pill tone={TONES[item.kind]}>{KIND_LABELS[item.kind]}</Pill></td>
                          <td>{item.unit}</td>
                          <td>{stock}</td>
                          <td>{floor}</td>
                          <td><Pill tone={item.active ? 'green' : 'neutral'}>{item.active ? 'Đang dùng' : 'Ngừng dùng'}</Pill></td>
                          <td>
                            <div className={ui.rowActions}>
                              <button type="button" className={ui.small} aria-label={`Xem ${item.name}`} onClick={() => setOpened(item)}><Eye size={14} aria-hidden="true" /></button>
                              <button type="button" className={ui.small} aria-label={`Sửa ${item.name}`} onClick={() => setDialog('items')}><Pencil size={14} aria-hidden="true" /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={listed.length} unit="vật tư" onPage={setPage} />
            </>
          )}
        </section>

        <section className={`${kit.card} ${styles.side}`} aria-labelledby="handed-title">
          <div className={styles.sideHead}>
            <h2 id="handed-title"><Clock size={18} aria-hidden="true" />Lịch sử cấp phát</h2>
            <button type="button" className={kit.linkButton} onClick={() => setDialog('history')}>Xem tất cả <ArrowRight size={13} aria-hidden="true" /></button>
          </div>
          {handed.length === 0 ? <p className={styles.none}>Tháng này chưa cấp vật tư.</p> : (
            <ul>
              {handed.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <CalendarDays size={15} aria-hidden="true" />
                  <span><strong>{a.item_name}</strong><small>{dayMonthYear(a.advanced_on.slice(0, 10))} · {number(a.quantity)} {a.unit} → {a.household_name}</small></span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={kit.linkButton} onClick={() => setDialog('bank')}>Tài khoản nhận tiền của hộ</button>
        </section>
      </div>

      <Modal isOpen={dialog === 'items'} onClose={close} title="Danh mục vật tư" size="lg"><ItemCatalogue items={all} onChanged={loadItems} /></Modal>
      <Modal isOpen={dialog === 'advance'} onClose={close} title="Cấp phát vật tư" size="lg"><AdvanceForm items={all.filter((i) => i.active)} onSaved={close} /></Modal>
      <Modal isOpen={dialog === 'history'} onClose={close} title="Phiếu cấp phát hôm nay" size="lg"><TodayAdvances revision={revision} /></Modal>
      <Modal isOpen={dialog === 'bank'} onClose={close} title="Tài khoản nhận tiền" size="lg"><HouseholdBankSection /></Modal>

      <Modal isOpen={!!opened} onClose={() => setOpened(null)} title={opened?.name ?? ''} size="sm">
        {opened && <p>{KIND_LABELS[opened.kind]} · đơn vị {opened.unit} · đơn giá {number(opened.unit_price_vnd)} đ</p>}
      </Modal>
    </div>
  )
}
