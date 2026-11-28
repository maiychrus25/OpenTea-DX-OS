// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { DRY_TEA_GRADE_LABELS } from '@/domain/processing/grades'
import type { SeasonReport } from '@/domain/report/views'
import { REPORT_SECTIONS, type ReportSection } from '@/domain/report/views'
import { formatVnd } from '@/lib/ledger/money'
import { reportCsvHref, SECTION_LABELS } from '@/lib/report/period'
import styles from './report.module.css'

const kg = (value: number) => value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const count = (value: number) => value.toLocaleString('vi-VN')
const money = (vnd: string) => `${formatVnd(vnd)} đ`

interface Props {
  report: SeasonReport
  from: string
  to: string
}

/** The seven sections in order: each with its own CSV link, and a null section says it failed to load. */
export function ReportSections({ report, from, to }: Props) {
  return (
    <div className={styles.sections}>
      {REPORT_SECTIONS.map(section => (
        <section key={section} className={styles.section} aria-labelledby={`section-${section}`}>
          <div className={styles.sectionHead}>
            <h2 id={`section-${section}`} className={styles.sectionTitle}>{SECTION_LABELS[section]}</h2>
            <a className={styles.link} href={reportCsvHref(section, from, to)}>Tải CSV</a>
          </div>
          <SectionBody section={section} report={report} />
        </section>
      ))}
    </div>
  )
}

function SectionBody({ section, report }: { section: ReportSection; report: SeasonReport }) {
  switch (section) {
    case 'members': {
      const m = report.members
      if (!m) return <Failed />
      return (
        <dl className={styles.metrics}>
          <div><dt>Nông hộ</dt><dd>{count(m.households)}</dd></div>
          <div><dt>Thửa</dt><dd>{count(m.parcels)}</dd></div>
          <div><dt>Diện tích</dt><dd>{kg(m.area_ha)} ha</dd></div>
        </dl>
      )
    }
    case 'purchases': {
      const p = report.purchases
      if (!p) return <Failed />
      return (
        <>
          <dl className={styles.metrics}>
            <div><dt>Tổng kg tịnh</dt><dd>{kg(p.total.net_kg)} kg</dd></div>
            <div><dt>Thành tiền</dt><dd>{money(p.total.amount_vnd)}</dd></div>
            <div><dt>Số phiếu</dt><dd>{count(p.total.tickets)}</dd></div>
          </dl>
          <Table head={['Tháng', 'Kg tịnh', 'Thành tiền', 'Phiếu']} rows={p.months.map(m => [m.month, kg(m.net_kg), money(m.amount_vnd), count(m.tickets)])} />
          <Table head={['Phẩm cấp', 'Kg tịnh', 'Thành tiền']} rows={p.by_grade.map(g => [g.grade_name, kg(g.net_kg), money(g.amount_vnd)])} />
        </>
      )
    }
    case 'member_money': {
      const mm = report.member_money
      if (!mm) return <Failed />
      return (
        <dl className={styles.metrics}>
          <div><dt>Kỳ đã chốt</dt><dd>{count(mm.periods_closed)}</dd></div>
          <div><dt>Đã trả xã viên</dt><dd>{money(mm.paid_vnd)}</dd></div>
          <div><dt>Còn phải trả</dt><dd>{money(mm.payable_open_vnd)}</dd></div>
          <div><dt>Vật tư đã ứng</dt><dd>{money(mm.advances_vnd)}</dd></div>
        </dl>
      )
    }
    case 'processing': {
      const pr = report.processing
      if (!pr) return <Failed />
      return (
        <>
          <dl className={styles.metrics}>
            <div><dt>Số mẻ</dt><dd>{count(pr.batches)}</dd></div>
            <div><dt>Kg búp vào</dt><dd>{kg(pr.fresh_kg)} kg</dd></div>
            <div><dt>Kg chè khô</dt><dd>{kg(pr.dry_kg)} kg</dd></div>
            <div><dt>Tỷ lệ trung bình</dt><dd>{pr.avg_ratio === null ? '—' : `${pr.avg_ratio.toFixed(2).replace('.', ',')} : 1`}</dd></div>
            <div><dt>Mẻ lệch chuẩn</dt><dd>{count(pr.out_of_band)}</dd></div>
          </dl>
          <Table head={['Hạng', 'Kg']} rows={pr.by_grade.map(g => [DRY_TEA_GRADE_LABELS[g.grade], kg(g.kg)])} />
        </>
      )
    }
    case 'lots': {
      const l = report.lots
      if (!l) return <Failed />
      return (
        <>
          <dl className={styles.metrics}>
            <div><dt>Lô</dt><dd>{count(l.lots)}</dd></div>
            <div><dt>Đã xuất QR</dt><dd>{count(l.exported)}</dd></div>
            <div><dt>Kg lô</dt><dd>{kg(l.kg)} kg</dd></div>
          </dl>
          <Table head={['Loại', 'Số', 'Nơi cấp', 'Hết hạn']} rows={l.certificates_valid.map(c => [c.kind, c.number, c.issuer, c.expires_on])} />
        </>
      )
    }
    case 'sales': {
      const s = report.sales
      if (!s) return <Failed />
      return (
        <>
          <dl className={styles.metrics}>
            <div><dt>Bán sỉ</dt><dd>{money(s.wholesale_vnd)}</dd></div>
            <div><dt>Bán lẻ</dt><dd>{money(s.retail_vnd)}</dd></div>
            <div><dt>Kg đã bán</dt><dd>{kg(s.kg_sold)} kg</dd></div>
            <div><dt>Còn phải thu</dt><dd>{money(s.receivable_vnd)}</dd></div>
          </dl>
          <Table head={['Đối tác', 'Số tiền']} rows={s.top_partners.map(p => [p.partner_name, money(p.amount_vnd)])} />
        </>
      )
    }
    case 'safety': {
      const sf = report.safety
      if (!sf) return <Failed />
      return (
        <dl className={styles.metrics}>
          <div><dt>Lần phun đã duyệt</dt><dd>{count(sf.sprayings_approved)}</dd></div>
          <div><dt>Lần thu hoạch đã duyệt</dt><dd>{count(sf.harvests_approved)}</dd></div>
        </dl>
      )
    }
  }
}

function Failed() {
  return <p role="status" className={styles.failed}>Chưa tải được phần này</p>
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p className={styles.muted}>Không có dữ liệu trong kỳ này.</p>
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
