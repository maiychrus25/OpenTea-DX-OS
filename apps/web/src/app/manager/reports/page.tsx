// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3, CalendarDays, Coins, Download, FileText, Layers, Search, Sprout, Trophy, Truck, Users } from 'lucide-react'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { prisma } from '@/infrastructure/db/prisma.client'
import { loadSeasonReport } from '@/lib/report/season-report-data'
import { periodProblem, yearPeriod } from '@/lib/report/period'
import { localDay } from '@/domain/shared/local-day'
import { vnDayStart } from '@/application/agent/campaign/vn-day'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCards } from '@/components/features/manager-web/parts'
import ui from '@/components/features/manager-web/kit.module.css'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { Donut, LineChart, shade } from './_components/charts'
import styles from './_components/reports.module.css'

const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
const date = (value: string) => value.split('-').reverse().join('/')
const DAY_MS = 24 * 60 * 60 * 1000

interface Search { mode?: string; year?: string; from?: string; to?: string; grade?: string }

/** The chosen period: a calendar year, or the season's own dates (the last 90 days to start with). */
function periodOf(params: Search, today: string) {
  const byYear = params.mode === 'year'
  const year = Number(params.year) || Number(today.slice(0, 4))
  if (byYear) return { byYear, year, ...yearPeriod(year) }
  const before = localDay(new Date(Date.parse(`${today}T12:00:00Z`) - 89 * DAY_MS))
  const from = params.from ?? before
  const to = params.to ?? today
  return periodProblem(from, to) ? { byYear, year, from: before, to: today } : { byYear, year, from, to }
}

export default async function ManagerReportsPage({ searchParams = {} }: { searchParams?: Search }) {
  const session = await auth()
  if (!session || session.user?.role !== 'manager') redirect('/login')
  const { htxProfileId } = await requireTenant()
  const today = localDay(new Date())
  const { byYear, year, from, to } = periodOf(searchParams, today)
  const grade = searchParams.grade ?? ''

  const [report, tickets] = await Promise.all([
    loadSeasonReport(htxProfileId, from, to, '', new Date()).catch(() => null),
    prisma.freshLeafTicket.findMany({
      where: { htx_profile_id: htxProfileId, status: 'VALID', weighed_at: { gte: vnDayStart(from), lt: new Date(vnDayStart(to).getTime() + DAY_MS) } },
      select: { weighed_at: true, net_kg: true, amount_vnd: true, household: { select: { name: true } }, grade: { select: { name: true, sort_order: true } } },
    }).catch(() => []),
  ])

  const gradeNames = Array.from(new Map([...tickets].sort((a, b) => a.grade.sort_order - b.grade.sort_order).map((t) => [t.grade.name, true])).keys())
  const mine = tickets.filter((t) => !grade || t.grade.name === grade)
  const sum = (rows: typeof tickets) => Math.round(rows.reduce((total, t) => total + Number(t.net_kg), 0) * 10) / 10
  const totalKg = sum(mine)
  const parts = gradeNames.filter((name) => !grade || name === grade).map((name) => ({ label: name, kg: sum(mine.filter((t) => t.grade.name === name)) }))
  const leafCost = mine.reduce((total, t) => total + Number(t.amount_vnd), 0)
  const revenue = report?.sales ? Number(report.sales.wholesale_vnd) + Number(report.sales.retail_vnd) : 0

  const households = Array.from(new Set(mine.map((t) => t.household.name)))
  const top = households.map((name) => ({ name, kg: sum(mine.filter((t) => t.household.name === name)) })).sort((a, b) => b.kg - a.kg).slice(0, 3)

  // Weekly points from the first to the last week that has a ticket.
  const weekOf = (at: Date) => Math.floor((at.getTime() - vnDayStart(from).getTime()) / (7 * DAY_MS))
  const used = mine.map((t) => weekOf(t.weighed_at))
  const first = used.length ? Math.max(0, Math.min(...used) - 3) : 0
  const last = used.length ? Math.max(...used) : 0
  const points = Array.from({ length: last - first + 1 }, (_, i) => {
    const week = first + i
    return {
      label: date(localDay(new Date(vnDayStart(from).getTime() + week * 7 * DAY_MS))).slice(0, 5),
      kg: sum(mine.filter((t) => weekOf(t.weighed_at) === week)),
    }
  }).slice(-13)

  const link = (mode: string) => `/manager/reports?mode=${mode}`

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<BarChart3 size={28} />}
        title="Báo cáo vụ/năm"
        description="Tổng hợp sản lượng, doanh thu, chi phí và lợi nhuận theo vụ hoặc theo năm."
        actions={
          <>
            <Link className={byYear ? kit.secondary : kit.primary} href={link('season')} aria-current={byYear ? undefined : 'page'}>Theo vụ</Link>
            <Link className={byYear ? kit.primary : kit.secondary} href={link('year')} aria-current={byYear ? 'page' : undefined}>Theo năm</Link>
            <Link className={kit.secondary} href={`/manager/reports/view?from=${from}&to=${to}`}><Download size={16} aria-hidden="true" />Xuất báo cáo</Link>
          </>
        }
      />

      <form className={`${kit.card} ${styles.filters}`} action="/manager/reports" method="get">
        <input type="hidden" name="mode" value={byYear ? 'year' : 'season'} />
        {byYear ? (
          <label>Năm
            <select className={ui.control} name="year" defaultValue={year}>
              {[0, 1, 2].map((back) => <option key={back} value={Number(today.slice(0, 4)) - back}>{Number(today.slice(0, 4)) - back}</option>)}
            </select>
          </label>
        ) : (
          <>
            <label>Vụ từ <input className={ui.control} type="date" name="from" defaultValue={from} required /></label>
            <label>đến <input className={ui.control} type="date" name="to" defaultValue={to} required /></label>
          </>
        )}
        <label>Sản phẩm
          <select className={ui.control} name="grade" defaultValue={grade}>
            <option value="">Tất cả</option>
            {gradeNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <button type="submit" className={kit.primary}><Search size={16} aria-hidden="true" />Xem báo cáo</button>
      </form>

      <StatCards items={[
        { label: 'Sản lượng', value: `${number(totalKg)} kg`, icon: <Sprout size={26} /> },
        { label: 'Doanh thu', value: `${number(revenue)} đ`, icon: <Coins size={26} /> },
        { label: 'Chi phí', value: `${number(leafCost)} đ`, icon: <Layers size={26} />, note: 'Tiền mua búp' },
        { label: 'Lợi nhuận', value: `${number(revenue - leafCost)} đ`, icon: <BarChart3 size={26} />, note: 'Chưa trừ chi phí khác' },
      ]} />

      <div className={styles.row}>
        <section className={styles.panel} aria-labelledby="by-grade">
          <h2 id="by-grade">Sản lượng theo loại búp</h2>
          {totalKg === 0 ? <p className={styles.empty}>Kỳ này chưa có phiếu cân.</p> : (
            <div className={styles.split}>
              <Donut parts={parts} />
              <div>
                <table>
                  <thead><tr><th>Loại búp</th><th>Sản lượng (kg)</th><th>Tỷ lệ</th></tr></thead>
                  <tbody>
                    {parts.map((p, i) => (
                      <tr key={p.label}>
                        <td><i className={styles.swatch} style={{ background: shade(i, parts.length) }} aria-hidden="true" />{p.label}</td>
                        <td>{number(p.kg)}</td>
                        <td>{((p.kg / totalKg) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
        <section className={styles.panel} aria-labelledby="facts">
          <h2 id="facts">Chỉ số vụ</h2>
          <dl className={styles.facts}>
            <div><dt><CalendarDays size={15} aria-hidden="true" /> Thời gian</dt><dd>{date(from)} – {date(to)}</dd></div>
            <div><dt><Users size={15} aria-hidden="true" /> Số xã viên tham gia</dt><dd>{households.length} người</dd></div>
            <div><dt><FileText size={15} aria-hidden="true" /> Số phiếu cân</dt><dd>{mine.length} phiếu</dd></div>
            <div><dt><Truck size={15} aria-hidden="true" /> Khối lượng bình quân</dt><dd>{households.length ? number(totalKg / households.length) : '0'} kg/xã viên</dd></div>
          </dl>
        </section>
      </div>

      <div className={styles.row}>
        <section className={styles.panel} aria-labelledby="trend">
          <h2 id="trend">Diễn biến thu mua theo thời gian</h2>
          {totalKg === 0 ? <p className={styles.empty}>Kỳ này chưa có phiếu cân.</p> : <LineChart points={points} />}
        </section>
        <section className={styles.panel} aria-labelledby="top">
          <h2 id="top"><Trophy size={16} aria-hidden="true" />Top xã viên sản lượng cao</h2>
          {top.length === 0 ? <p className={styles.empty}>Chưa có số liệu.</p> : (
            <ol className={styles.top}>
              {top.map((row, i) => <li key={row.name}><b>{i + 1}</b><span>{row.name}</span><strong>{number(row.kg)} kg</strong></li>)}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
