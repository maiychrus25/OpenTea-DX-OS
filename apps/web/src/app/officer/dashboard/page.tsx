// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import Link from 'next/link'
import React from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { Map, Clock, Stethoscope, Users, Plus, CheckSquare, TriangleAlert } from 'lucide-react'
import { MetricCard, Pill, Panel } from '@/components/ui'
import { WeatherHero } from '@/components/features/farmer-web/WeatherHero'
import { ReportPhoto } from '@/components/features/disease/ReportPhoto'
import { OverviewJournal } from '@/components/features/officer-web/OverviewJournal'
import { OverviewActivityChart, OverviewSparkline } from '@/components/features/officer-web/OverviewCharts'
import { ACTIVITY_LABELS, DAY, approvalMetrics, cultivated, dailyCounts, dayMonth, householdProgress, latestSafeDates, vietnamDayStart, weeklyActivity } from '@/components/features/officer-web/overview-data'
import { loadOverview } from './overview-query'
import styles from '@/components/features/officer-web/overview.module.css'

export const dynamic = 'force-dynamic'

const DISEASE_STATUS = {
  PENDING: { label: 'Chờ', tone: 'wait' }, CONFIRMED: { label: 'Đã xác nhận', tone: 'ok' }, REJECTED: { label: 'Đã bác bỏ', tone: 'muted' },
} as const
const MAP_STATES = {
  normal: 'Bình thường', watch: 'Cần theo dõi', disease: 'Có ca bệnh', inactive: 'Không canh tác',
} as const

export default async function OfficerDashboard({ searchParams }: { searchParams?: { page?: string } }) {
  const session = await auth()
  if (!session || session.user?.role !== 'officer') redirect('/login')
  const { htxProfileId } = await requireTenant()
  const now = new Date()
  const data = await loadOverview(htxProfileId, now, Number(searchParams?.page ?? 1))
  const { pendingEntries, pendingDiseases, households, diseases, cycles, htx } = data
  const parcels = households.flatMap(household => household.parcels)
  const active = parcels.filter(parcel => cultivated(parcel.status))
  const safeDates = latestSafeDates(data.activities)
  const unsafe = cycles.filter(cycle => cycle.estimated_harvest_date! < (safeDates.get(cycle.parcel_id) ?? new Date(0)))
  const upcoming = cycles.filter(cycle => cycle.estimated_harvest_date! >= vietnamDayStart(now) && cycle.estimated_harvest_date! < new Date(vietnamDayStart(now).getTime() + 7 * DAY))
  const approval = approvalMetrics(data.approvedEntries)
  const progress = householdProgress(parcels)
  const area = active.reduce((sum, parcel) => sum + parcel.area_ha, 0)
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hourCycle: 'h23' }).format(now))
  const greeting = hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
  const date = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)
  const metricDetails = [
    pendingEntries.length ? `Cũ nhất: ${Math.max(0, Math.floor((now.getTime() - pendingEntries[0].created_at.getTime()) / DAY))} ngày` : 'Không có nhật ký chờ duyệt',
    pendingDiseases.length ? `Cũ nhất: ${dayMonth(pendingDiseases[0].detection_date)}` : 'Không có ca bệnh chờ xác nhận',
    `${area.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ha · ${new Set(upcoming.map(cycle => cycle.parcel_id)).size} thửa sắp hái`,
    progress.percent === null ? 'Chưa có thửa đang canh tác' : `${progress.recorded}/${progress.active} thửa có nhật ký 7 ngày`,
  ]
  const metrics = [
    { label: 'Chờ duyệt', value: pendingEntries.length, href: '/officer/journal?status=PENDING_APPROVAL', icon: <Clock />, tone: 'amber' as const, dates: pendingEntries.map(entry => entry.created_at), series: 'Nhật ký hiện chờ duyệt, theo ngày tạo trong 7 ngày' },
    { label: 'Ca bệnh cần xác nhận', value: pendingDiseases.length, href: '/officer/diseases', icon: <Stethoscope />, tone: 'red' as const, dates: pendingDiseases.map(report => report.detection_date), series: 'Ca hiện chờ xác nhận, theo ngày phát hiện trong 7 ngày' },
    { label: 'Thửa đang canh tác', value: active.length, href: '/officer/farm-zones', icon: <Map />, tone: 'green' as const, dates: active.map(parcel => parcel.created_at), series: 'Thửa hiện canh tác, theo ngày tạo trong 7 ngày' },
    { label: 'Nông hộ quản lý', value: households.length, href: '/officer/households', icon: <Users />, tone: 'blue' as const, dates: households.map(household => household.created_at), series: 'Nông hộ theo ngày tạo trong 7 ngày' },
  ]
  const mapParcels = parcels.map(parcel => ({ ...parcel, state: !cultivated(parcel.status) ? 'inactive' : parcel.disease_reports.length ? 'disease' : (safeDates.get(parcel.id)?.getTime() ?? 0) > now.getTime() ? 'watch' : 'normal' } as const))
  const urgentCount = unsafe.length + pendingDiseases.length

  return <main className={styles.page}>
    <WeatherHero eyebrow={['Cán bộ kỹ thuật', htx?.name].filter(Boolean).join(' · ')} title={`${greeting}, ${session.user.name || 'Cán bộ KT'}`}
      subtitle={`${date} · ${pendingEntries.length} nhật ký và ${pendingDiseases.length} ca bệnh chờ xử lý`}
      place={htx?.address || htx?.name || ''} cached={null} forecastHref="/officer/bulletin?category=weather"
      actions={[
        { href: '/officer/journal?status=PENDING_APPROVAL', label: 'Duyệt nhật ký', icon: <CheckSquare size={16} aria-hidden="true" /> },
        { href: '/officer/diseases', label: 'Xem ca bệnh', icon: <Stethoscope size={16} aria-hidden="true" /> },
        { href: '/officer/journal?create=1', label: 'Tạo nhật ký', icon: <Plus size={16} aria-hidden="true" /> },
      ]} />

    <section className={styles.metrics} data-testid="officer-metric-grid" aria-label="Tổng quan công việc">
      {metrics.map((metric, index) => <Link key={metric.label} href={metric.href} className={styles.metricLink} aria-label={`Xem ${metric.label}`}>
        <MetricCard icon={metric.icon} label={metric.label} value={metric.value} detail={metricDetails[index]} tone={metric.tone} />
        <OverviewSparkline values={dailyCounts(metric.dates, now)} label={metric.series} />
      </Link>)}
    </section>

    {urgentCount > 0 && <section className={styles.urgent} aria-labelledby="urgent-heading">
      <h2 id="urgent-heading"><TriangleAlert size={17} aria-hidden="true" />Cần xử lý ngay · {urgentCount}</h2>
      <div className={styles.urgentItems}>
        {unsafe.map(cycle => <div key={cycle.id} className={styles.urgentRow}>
          <div><strong>Lịch hái {cycle.parcel.parcel_code} ({dayMonth(cycle.estimated_harvest_date!)}) trùng thời gian cách ly</strong><small>{cycle.parcel.household.name} · Ngày an toàn: {dayMonth(safeDates.get(cycle.parcel_id)!)}</small></div>
          <Link href="/officer/schedule" className={styles.action}>Đổi lịch hái</Link>
        </div>)}
        {pendingDiseases.map(report => <div key={report.id} className={styles.urgentRow}>
          <div><strong>{report.ai_disease_name} tại {report.parcel.parcel_code} chờ xác nhận</strong><small>{dayMonth(report.detection_date)} · {report.household.name}</small></div>
          <Link href={`/officer/diseases/${report.id}`} className={styles.action}>Xác nhận ca bệnh</Link>
        </div>)}
      </div>
    </section>}

    <div className={styles.workGrid}>
      <Panel title="Nhật ký gần đây" href="/officer/journal" className={styles.panel}>
        <OverviewJournal page={data.page} pageCount={data.pageCount} total={data.total} entries={data.entries.map(entry => ({
          id: entry.id, parcelCode: entry.parcel.parcel_code, household: entry.parcel.household.name,
          activity: [ACTIVITY_LABELS[entry.activity_type] || entry.activity_type, entry.activities[0]?.product_name].filter(Boolean).join(' · '),
          date: dayMonth(entry.entry_date), status: entry.status,
        }))} />
      </Panel>
      <div className={styles.stack}>
        <Panel title="Ca bệnh mới" href="/officer/diseases" linkLabel="Xem" className={styles.panel}>
          {!diseases.length ? <p className={styles.empty}>Chưa có ca bệnh</p> : <ul className={styles.list}>{diseases.map(report => <li key={report.id}>
            <Link className={styles.report} href={report.status === 'PENDING' ? `/officer/diseases/${report.id}` : '/officer/diseases'}>
              {report.photo_url && <span className={styles.photo}><ReportPhoto src={report.photo_url} alt={`Ảnh ${report.parcel.parcel_code}`} className={styles.reportImage} compact /></span>}
              <span className={styles.rowMain}><strong>{report.confirmed_diagnosis || report.ai_disease_name} · {report.parcel.parcel_code}</strong><small>AI {Math.round(report.ai_confidence <= 1 ? report.ai_confidence * 100 : report.ai_confidence)}% · {dayMonth(report.detection_date)}</small></span>
              <Pill tone={DISEASE_STATUS[report.status].tone}>{DISEASE_STATUS[report.status].label}</Pill>
            </Link>
          </li>)}</ul>}
        </Panel>
        <Panel title="Lịch hái 7 ngày tới" href="/officer/schedule" linkLabel="Xem lịch" className={styles.panel}>
          {!upcoming.length ? <p className={styles.empty}>Chưa có lịch thu hái</p> : <ul className={styles.schedule}>{upcoming.map(cycle => {
            const waiting = cycle.estimated_harvest_date! < (safeDates.get(cycle.parcel_id) ?? new Date(0))
            return <li key={cycle.id}><Link href="/officer/schedule" className={styles.report}>
              <strong className={styles.date}>{dayMonth(cycle.estimated_harvest_date!)}</strong><span className={styles.rowMain}>{cycle.parcel.parcel_code}<small>{cycle.parcel.household.name}</small></span>
              <Pill tone={waiting ? 'bad' : 'ok'}><span title="So sánh ngày hái dự kiến với ngày an toàn của nhật ký; không thay thế phê duyệt thu hoạch">{waiting ? 'Còn cách ly' : 'Được hái'}</span></Pill>
            </Link></li>
          })}</ul>}
        </Panel>
      </div>
    </div>

    <div className={styles.equalGrid}>
      <Panel title="Bản đồ vùng chè" href="/officer/farm-zones" linkLabel="Mở bản đồ" className={styles.panel}>
        <p className={styles.caption}>Trạng thái từng thửa chè</p>
        {!mapParcels.length ? <p className={styles.empty}>Chưa có thửa chè</p> : <div className={styles.parcelMap}>
          {mapParcels.map(parcel => <Link key={parcel.id} href="/officer/farm-zones" className={`${styles.parcel} ${styles[parcel.state]}`} title={`${parcel.parcel_code}: ${MAP_STATES[parcel.state]}`}>
            <strong>{parcel.parcel_code}</strong><small>{MAP_STATES[parcel.state]}</small>
          </Link>)}
        </div>}
        <ul className={styles.mapLegend}>{Object.entries(MAP_STATES).map(([state, label]) => <li key={state}><i className={styles[state]} aria-hidden="true" />{label} ({mapParcels.filter(parcel => parcel.state === state).length})</li>)}</ul>
      </Panel>
      <Panel title="Hoạt động canh tác 30 ngày" className={styles.panel}>
        <OverviewActivityChart weeks={weeklyActivity(data.monthlyEntries, now)} />
        {approval && <dl className={styles.approval}>
          <div title={`Trong ${approval.count} nhật ký được duyệt 30 ngày qua, tỷ lệ có approved_at − created_at ≤ 48 giờ. Ngưỡng hiển thị của dashboard, không phải SLA đã cấu hình.`}><dt>Tỉ lệ duyệt đúng hạn</dt><dd>{approval.rate}%</dd></div>
          <div title={`Trung bình (approved_at − created_at), tính theo ngày 24 giờ, của ${approval.count} nhật ký được duyệt trong 30 ngày qua.`}><dt>Thời gian duyệt trung bình</dt><dd>{approval.averageDays.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ngày</dd></div>
        </dl>}
      </Panel>
    </div>

    <div className={styles.equalGrid}>
      <Panel title="Nông hộ" href="/officer/households" className={styles.panel}>
        <div className={styles.householdScroll} tabIndex={0} aria-label="Nông hộ và tiến độ nhật ký">
          <table className={styles.table}><thead><tr><th>Nông hộ</th><th>Số thửa</th><th>Diện tích</th><th title="Số thửa đang canh tác có nhật ký trong 7 ngày qua / tổng thửa đang canh tác">Tiến độ ghi nhật ký</th></tr></thead>
            <tbody>{households.length ? households.map(household => {
              const coverage = householdProgress(household.parcels)
              return <tr key={household.id}><td><Link href={`/officer/households/${household.id}`}>{household.name}</Link></td><td>{household.parcels.length} thửa</td><td>{household.parcels.reduce((sum, parcel) => sum + parcel.area_ha, 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ha</td><td>{coverage.percent === null ? 'Chưa canh tác' : <span className={styles.progress}><progress value={coverage.percent} max={100} aria-label={`Tiến độ ${household.name}`} />{coverage.percent}%</span>}</td></tr>
            }) : <tr><td colSpan={4} className={styles.empty}>Chưa có nông hộ</td></tr>}</tbody>
          </table>
        </div>
      </Panel>
    </div>
  </main>
}
