// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import Link from 'next/link'
import React from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { FileText, Map, Clock, Stethoscope, Users, Plus, CheckSquare } from 'lucide-react'
import { prisma } from '@/infrastructure/db/prisma.client'
import { MetricCard, Pill, HeroBanner, Panel, EmptyState } from '@/components/ui'
import styles from '@/components/features/dashboard/dashboard.module.css'

export const dynamic = 'force-dynamic'

function getGreeting(): string {
  const now = new Date()
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
  const hour = vnTime.getHours()
  if (hour < 12) return 'Chào buổi sáng'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date)
}

const ACTIVITY_LABELS: Record<string, string> = {
  SOWING: 'Gieo sạ',
  FERTILIZING: 'Bón phân',
  SPRAYING: 'Phun thuốc',
  IRRIGATION: 'Tưới tiêu',
  HARVEST: 'Thu hoạch',
  OTHER: 'Khác',
}

const DISEASE_STATUS = {
  PENDING: { label: 'Chờ', tone: 'wait' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'ok' },
  REJECTED: { label: 'Đã bác bỏ', tone: 'muted' },
} as const

function dayMonth(date: Date): string {
  return date.toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' })
}

const STATUS_LABELS: Record<string, { label: string; tone: 'wait' | 'ok' | 'info' | 'bad' | 'muted' }> = {
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'wait' },
  APPROVED: { label: 'Đã duyệt', tone: 'ok' },
  REJECTED: { label: 'Từ chối', tone: 'bad' },
  REQUEST_CHANGES: { label: 'Yêu cầu sửa', tone: 'info' },
}

export default async function OfficerDashboard() {
  const session = await auth()
  if (!session || session.user?.role !== 'officer') {
    redirect('/login')
  }

  const { htxProfileId } = await requireTenant()
  const now = new Date()
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [pendingJournals, activeParcels, totalHouseholds, entries, pendingDiseases, diseases, harvests, htx] = await Promise.all([
    prisma.journalEntry.count({
      where: {
        parcel: { household: { htx_profile_id: htxProfileId } },
        status: 'PENDING_APPROVAL',
      },
    }),
    prisma.parcel.count({
      where: {
        household: { htx_profile_id: htxProfileId },
        status: { notIn: ['HARVESTED', 'DRAFT'] },
      },
    }),
    prisma.household.count({
      where: { htx_profile_id: htxProfileId },
    }),
    prisma.journalEntry.findMany({
      where: {
        parcel: { household: { htx_profile_id: htxProfileId } },
      },
      orderBy: { entry_date: 'desc' },
      take: 8,
      include: {
        parcel: { select: { parcel_code: true, household: { select: { name: true } } } },
        activities: { select: { activity_detail: true, product_name: true }, take: 1 },
      },
    }),
    prisma.diseaseReport.count({
      where: { household: { htx_profile_id: htxProfileId }, status: 'PENDING' },
    }),
    prisma.diseaseReport.findMany({
      where: { household: { htx_profile_id: htxProfileId } },
      orderBy: { detection_date: 'desc' },
      take: 3,
      select: { id: true, ai_disease_name: true, confirmed_diagnosis: true, ai_confidence: true, detection_date: true, status: true, parcel: { select: { parcel_code: true } } },
    }),
    prisma.parcelCropCycle.findMany({
      where: { parcel: { household: { htx_profile_id: htxProfileId } }, estimated_harvest_date: { gte: now, lte: weekAhead } },
      orderBy: { estimated_harvest_date: 'asc' },
      take: 6,
      select: { id: true, estimated_harvest_date: true, parcel: { select: { parcel_code: true, household: { select: { name: true } } } } },
    }),
    prisma.htxProfile.findUnique({ where: { id: htxProfileId }, select: { name: true } }),
  ])

  const recentEntries = entries.map((e) => ({
    id: e.id,
    parcel_code: e.parcel?.parcel_code || '—',
    activity_type: e.activity_type,
    entry_date: e.entry_date,
    status: e.status,
    household: e.parcel?.household?.name || '—',
    product: e.activities?.[0]?.product_name || '',
  }))

  return (
    <main className={styles.page}>
      <HeroBanner
        eyebrow={['Cán bộ kỹ thuật', htx?.name].filter(Boolean).join(' · ')}
        title={`${getGreeting()}, ${session.user.name || 'Cán bộ KT'}`}
        subtitle={`${formatDate(now)} · ${pendingJournals} nhật ký và ${pendingDiseases} ca bệnh chờ xử lý`}
        actions={[
          { href: '/officer/journal', label: 'Duyệt nhật ký', icon: <CheckSquare size={18} aria-hidden="true" /> },
          { href: '/officer/diseases', label: 'Xem ca bệnh' },
          { href: '/officer/journal', label: 'Tạo nhật ký', icon: <Plus size={18} aria-hidden="true" /> },
        ]}
      />

      <section className={styles.metrics} data-testid="officer-metric-grid">
        <Link href="/officer/journal?status=PENDING_APPROVAL" className={styles.metricLink} aria-label="Xem Chờ duyệt">
          <MetricCard icon={<Clock />} label="Chờ duyệt" value={pendingJournals} tone="amber" />
        </Link>
        <Link href="/officer/diseases" className={styles.metricLink} aria-label="Xem Ca bệnh cần xác nhận">
          <MetricCard icon={<Stethoscope />} label="Ca bệnh cần xác nhận" value={pendingDiseases} tone="red" />
        </Link>
        <Link href="/officer/households" className={styles.metricLink} aria-label="Xem Thửa đang canh tác">
          <MetricCard icon={<Map />} label="Thửa đang canh tác" value={activeParcels} tone="green" />
        </Link>
        <Link href="/officer/households" className={styles.metricLink} aria-label="Xem Nông hộ quản lý">
          <MetricCard icon={<Users />} label="Nông hộ quản lý" value={totalHouseholds} tone="blue" />
        </Link>
      </section>

      <div className={styles.columns}>
        <Panel title="Nhật ký gần đây" href="/officer/journal">
          {recentEntries.length === 0 ? (
            <EmptyState icon={<FileText />} title="Chưa có nhật ký nào" description="Hãy tạo nhật ký canh tác đầu tiên." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} data-testid="task-table">
                <thead>
                  <tr><th>Mã thửa</th><th>Nông hộ</th><th>Hoạt động</th><th>Ngày</th><th>Trạng thái</th></tr>
                </thead>
                <tbody>
                  {recentEntries.map((entry) => {
                    const statusInfo = STATUS_LABELS[entry.status] || { label: entry.status, tone: 'muted' as const }
                    return (
                      <tr key={entry.id}>
                        <td className={styles.code}>{entry.parcel_code}</td>
                        <td>{entry.household}</td>
                        <td>{[ACTIVITY_LABELS[entry.activity_type] || entry.activity_type, entry.product].filter(Boolean).join(' · ')}</td>
                        <td>{dayMonth(new Date(entry.entry_date))}</td>
                        <td><Pill tone={statusInfo.tone}>{statusInfo.label}</Pill></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className={styles.stack}>
          <Panel title="Ca bệnh mới" href="/officer/diseases" linkLabel="Xem">
            {diseases.length === 0 ? (
              <EmptyState icon={<Stethoscope />} title="Chưa có ca bệnh" />
            ) : (
              <ul className={styles.list}>
                {diseases.map((report) => (
                  <li key={report.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <strong>{report.confirmed_diagnosis || report.ai_disease_name} · {report.parcel.parcel_code}</strong>
                      <small>AI {Math.round(report.ai_confidence <= 1 ? report.ai_confidence * 100 : report.ai_confidence)}% · {dayMonth(report.detection_date)}</small>
                    </div>
                    <Pill tone={DISEASE_STATUS[report.status].tone}>{DISEASE_STATUS[report.status].label}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Lịch hái 7 ngày tới" href="/officer/schedule" linkLabel="Xem lịch">
            {harvests.length === 0 ? (
              <EmptyState icon={<Clock />} title="Chưa có lịch thu hái" />
            ) : (
              <ul className={styles.list}>
                {harvests.map((cycle) => (
                  <li key={cycle.id} className={styles.row}>
                    <strong className={styles.rowDate}>{dayMonth(cycle.estimated_harvest_date!)}</strong>
                    <span>{cycle.parcel.parcel_code} · {cycle.parcel.household.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </main>
  )
}
