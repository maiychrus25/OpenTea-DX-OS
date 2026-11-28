// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Eye, FlaskConical, Layers, Leaf, Pencil, Plus, ShieldCheck, Sprout } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState, PageHeader, Pill } from '@/components/ui'
import { Pager, Sample, StatCards, pageOf } from '@/components/features/manager-web/parts'
import ui from '@/components/features/manager-web/kit.module.css'
import head from '@/components/features/dashboard/page-kit.module.css'
import table from '@/components/features/dashboard/dashboard.module.css'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import kit from '@/components/features/farmer-web/kit.module.css'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import type { PesticideRow } from '@/lib/pesticide/catalogue'
import { GROUP_LABELS, NEEDS_LABEL_CHECK_TEXT } from './PesticidePicker'
import styles from './PesticideCatalogue.module.css'

/** Groups of biological origin, counted together as the design's "chế phẩm sinh học". */
const BIO: PesticideRow['group'][] = ['BOTANICAL', 'MICROBIAL', 'BIOLOGICAL']

export function PesticideCatalogue({ designed = false }: { /** The cooperative head's layout. */ designed?: boolean } = {}) {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('')
  const [group, setGroup] = useState('')
  const [source, setSource] = useState('')
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState<PesticideRow | null>(null)
  const [rows, setRows] = useState<PesticideRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<PesticideRow | null>(null)
  const [days, setDays] = useState('')
  const [note, setNote] = useState('')
  const [confirmLow, setConfirmLow] = useState(false)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetchJson<{ data?: PesticideRow[] }>('/api/pesticides')
      .then(body => { setRows(body.data ?? []); setError('') })
      .catch(() => setError(LOAD_FAILED_MESSAGE))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const open = (row: PesticideRow) => {
    setEditing(row); setDays(String(row.label?.label_phi_days ?? row.floor_days)); setNote(row.label?.label_note ?? '')
    setConfirmLow(false); setFormError('')
  }
  const value = Number(days)
  const valid = Number.isInteger(value) && value >= 1 && value <= 365
  const below = !!editing && valid && value < editing.default_phi_days

  async function save() {
    if (!editing) return
    if (!valid) { setFormError('Số ngày cách ly phải từ 1 đến 365.'); return }
    if (below && !note.trim()) { setFormError('Nhập số lô hoặc mô tả nhãn khi thấp hơn mức mặc định.'); return }
    if (below && !confirmLow) { setFormError(''); setConfirmLow(true); return }
    setBusy(true); setFormError('')
    try {
      const res = await fetch(`/api/pesticides/${editing.id}/label`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label_phi_days: value, ...(note.trim() ? { label_note: note.trim() } : {}) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(body?.error?.message || 'Không lưu được nhãn.'); setConfirmLow(false); return }
      setEditing(null); load()
    } catch { setFormError('Lỗi kết nối máy chủ.') } finally { setBusy(false) }
  }

  async function removeLabel(row: PesticideRow) {
    const res = await fetch(`/api/pesticides/${row.id}/label`, { method: 'DELETE' })
    if (res.ok) load(); else setError('Không gỡ được nhãn.')
  }

  const dialog = (
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing ? `Cập nhật theo nhãn: ${editing.trade_name}` : ''} size="sm">
        <p>Nhập đúng số ngày cách ly ghi trên nhãn của lô thuốc đang có ở kho HTX.</p>
        <label className={styles.field}>Số ngày cách ly
          <input className={styles.input} type="number" min={1} max={365} value={days} onChange={e => { setDays(e.target.value); setConfirmLow(false) }} />
        </label>
        <label className={styles.field}>Ghi chú nhãn (số lô, mô tả){below ? ' *' : ''}
          <input className={styles.input} maxLength={200} value={note} onChange={e => setNote(e.target.value)} />
        </label>
        {confirmLow && editing && <p role="alert" className={styles.error}>Thấp hơn mức sàn mặc định {editing.default_phi_days} ngày. Xác nhận đúng như nhãn?</p>}
        {formError && <p role="alert" className={styles.error}>{formError}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setEditing(null)}>Hủy</Button>
          <Button isLoading={busy} onClick={save}>{confirmLow ? 'Xác nhận đúng như nhãn' : 'Lưu'}</Button>
        </div>
      </Modal>
  )

  if (designed) {
    const needle = search.trim().toLocaleLowerCase('vi')
    const bio = rows.filter((r) => BIO.includes(r.group))
    const listed = rows.filter((r) =>
      (!needle || `${r.trade_name} ${r.active_ingredient}`.toLocaleLowerCase('vi').includes(needle)) &&
      (!kind || (kind === 'bio') === BIO.includes(r.group)) &&
      (!group || r.group === group) &&
      (!source || (source === 'label') === !!r.label))
    const paged = pageOf(listed, page, 5)
    const set = (apply: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { apply(e.target.value); setPage(1) }

    return (
      <div className={head.page}>
        <PageHeader
          icon={<FlaskConical size={28} />}
          title="Danh mục thuốc"
          description="Quản lý danh sách thuốc bảo vệ thực vật và phân bón được phép sử dụng trên cây chè."
          actions={<button type="button" className={head.primary} onClick={() => toast.info('Danh mục thuốc do quản trị nền tảng cập nhật.')}><Plus size={16} aria-hidden="true" />Thêm thuốc / phân bón <Sample /></button>}
        />
        <StatCards items={[
          { label: 'Tổng danh mục', value: `${rows.length} sản phẩm`, icon: <Leaf size={26} /> },
          { label: 'Thuốc BVTV', value: `${rows.length - bio.length} sản phẩm`, icon: <ShieldCheck size={26} /> },
          { label: 'Phân bón', value: '11 sản phẩm', icon: <Layers size={26} />, sample: true },
          { label: 'Chế phẩm sinh học', value: `${bio.length} sản phẩm`, icon: <Sprout size={26} /> },
        ]} />
        <div className={ui.bar}>
          <input type="search" className={`${ui.control} ${ui.grow}`} aria-label="Tìm thuốc" placeholder="Tìm theo tên thuốc, hoạt chất..." value={search} onChange={set(setSearch)} />
          <select className={ui.control} aria-label="Loại" value={kind} onChange={set(setKind)}>
            <option value="">Loại: Tất cả</option><option value="chemical">Thuốc BVTV</option><option value="bio">Chế phẩm sinh học</option>
          </select>
          <select className={ui.control} aria-label="Nhóm" value={group} onChange={set(setGroup)}>
            <option value="">Nhóm: Tất cả</option>
            {(Object.keys(GROUP_LABELS) as PesticideRow['group'][]).map((key) => <option key={key} value={key}>{GROUP_LABELS[key]}</option>)}
          </select>
          <select className={ui.control} aria-label="Trạng thái" value={source} onChange={set(setSource)}>
            <option value="">Trạng thái: Tất cả</option><option value="label">Theo nhãn HTX</option><option value="default">Mức mặc định</option>
          </select>
        </div>
        {error && <p role="alert" className={head.error}>{error}</p>}
        <section className={head.card} aria-label="Danh sách thuốc">
          {loading ? <div className={head.state}>Đang tải...</div> : listed.length === 0 ? <EmptyState icon={<FlaskConical />} title="Không có sản phẩm nào theo bộ lọc này." /> : (
            <>
              <div className={table.tableWrap}>
                <table className={`${table.table} ${styles.designed}`}>
                  <thead><tr><th>#</th><th>Tên thương mại</th><th>Loại</th><th>Hoạt chất / Thành phần</th><th>Công dụng</th><th>Thời gian cách ly</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                  <tbody>
                    {paged.rows.map((row, index) => (
                      <tr key={row.id}>
                        <td>{paged.start + index + 1}</td>
                        <td><strong>{row.trade_name}</strong></td>
                        <td><Pill tone={BIO.includes(row.group) ? 'blue' : 'green'}>{BIO.includes(row.group) ? 'Chế phẩm SH' : 'Thuốc BVTV'}</Pill></td>
                        <td className={styles.wrap}>{row.active_ingredient}</td>
                        <td className={styles.wrap}>{row.targets.join(', ') || '—'}</td>
                        <td>{row.floor_days} ngày{row.label ? ' (nhãn HTX)' : ''}</td>
                        <td><Pill tone={row.needs_label_check ? 'amber' : 'green'}>{row.needs_label_check ? 'Cần đối chiếu nhãn' : 'Được sử dụng'}</Pill></td>
                        <td>
                          <div className={ui.rowActions}>
                            <button type="button" className={ui.small} aria-label={`Xem ${row.trade_name}`} onClick={() => setViewing(row)}><Eye size={14} aria-hidden="true" />Xem</button>
                            <button type="button" className={ui.small} aria-label={`Cập nhật theo nhãn ${row.trade_name}`} onClick={() => open(row)}><Pencil size={14} aria-hidden="true" />Sửa</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager current={paged.current} pages={paged.pages} start={paged.start} shown={paged.rows.length} total={listed.length} unit="sản phẩm" onPage={setPage} />
            </>
          )}
        </section>
        {dialog}
        <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title={viewing?.trade_name ?? ''} size="sm">
          {viewing && (
            <>
              <p>{GROUP_LABELS[viewing.group]} · {viewing.active_ingredient}</p>
              <p>Cách ly {viewing.floor_days} ngày · {viewing.label ? `Nhãn HTX${viewing.label.label_note ? ` · ${viewing.label.label_note}` : ''}` : 'Mặc định'}</p>
              {viewing.needs_label_check && <p className={styles.check}>{NEEDS_LABEL_CHECK_TEXT}</p>}
              {viewing.label && <Button size="sm" variant="secondary" onClick={() => { void removeLabel(viewing); setViewing(null) }}>Gỡ nhãn</Button>}
            </>
          )}
        </Modal>
      </div>
    )
  }

  return (
    <div className={kit.page}>
      <div className={kit.hd}>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Danh mục thuốc</h1>
          <p className={kit.sub}>Số ngày cách ly hiệu lực của HTX cho từng loại thuốc.</p>
        </div>
      </div>
      {loading && <p>Đang tải...</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead><tr><th>Thuốc</th><th>Nhóm</th><th>Ngày cách ly</th><th>Nguồn</th><th /></tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td><strong>{row.trade_name}</strong><br /><span className={kit.muted}>{row.active_ingredient}</span></td>
                <td>{GROUP_LABELS[row.group]}</td>
                <td>{row.floor_days} ngày</td>
                <td>
                  {row.label ? <>Nhãn HTX{row.label.label_note ? ` · ${row.label.label_note}` : ''}</> : 'Mặc định'}
                  {row.needs_label_check && <><br /><span className={styles.check}>{NEEDS_LABEL_CHECK_TEXT}</span></>}
                </td>
                <td className={styles.actions}>
                  <Button size="sm" variant="secondary" aria-label={`Cập nhật theo nhãn ${row.trade_name}`} onClick={() => open(row)}>Cập nhật theo nhãn</Button>
                  {row.label && <Button size="sm" variant="secondary" aria-label={`Gỡ nhãn ${row.trade_name}`} onClick={() => removeLabel(row)}>Gỡ nhãn</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog}
    </div>
  )
}
