// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { FileText, Map, PackageCheck, AlertCircle } from 'lucide-react'
import { prisma } from '@/infrastructure/db/prisma.client'
import { MetricCard, Pill } from '@/components/ui'
import styles from './officer-dashboard.module.css'

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

const STATUS_LABELS: Record<string, { label: string; tone: 'amber' | 'green' | 'blue' | 'neutral' }> = {
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'amber' },
  APPROVED: { label: 'Đã duyệt', tone: 'green' },
  REJECTED: { label: 'Từ chối', tone: 'neutral' },
  REQUEST_CHANGES: { label: 'Yêu cầu sửa', tone: 'blue' },
}

export default async function OfficerDashboard() {
  const session = await auth()
  if (!session || session.user?.role !== 'officer') {
    redirect('/login')
  }

  // Get HTX profile for scoping queries
  const htx = await prisma.htxProfile.findFirst()

  let pendingJournals = 0
  let activeParcels = 0
  let readyLots = 0
  let totalHouseholds = 0
  let recentEntries: {
    id: string
    parcel_code: string
    activity_type: string
    entry_date: Date
    status: string
    crop_type: string
  }[] = []

  if (htx) {
    const [pending, parcels, lots, households, entries] = await Promise.all([
      prisma.journalEntry.count({
        where: {
          parcel: { household: { htx_profile_id: htx.id } },
          status: 'PENDING_APPROVAL',
        },
      }),
      prisma.parcel.count({
        where: {
          household: { htx_profile_id: htx.id },
          status: { notIn: ['HARVESTED', 'DRAFT'] },
        },
      }),
      prisma.lot.count({
        where: { htx_profile_id: htx.id, status: 'READY' },
      }),
      prisma.household.count({
        where: { htx_profile_id: htx.id },
      }),
      prisma.journalEntry.findMany({
        where: {
          parcel: { household: { htx_profile_id: htx.id } },
        },
        orderBy: { entry_date: 'desc' },
        take: 8,
        include: {
          parcel: { select: { parcel_code: true, crop_type: true } },
          activities: { select: { activity_detail: true, product_name: true }, take: 1 },
        },
      }),
    ])

    pendingJournals = pending
    activeParcels = parcels
    readyLots = lots
    totalHouseholds = households
    recentEntries = entries.map((e) => ({
      id: e.id,
      parcel_code: e.parcel?.parcel_code || '—',
      activity_type: e.activity_type,
      entry_date: e.entry_date,
      status: e.status,
      crop_type: e.parcel?.crop_type || '—',
    }))
  }

  return (
    <main className={styles.container}>
      <header className={styles.pageHeader}>
        <div className={styles.headerContent}>
          {pendingJournals > 0 && (
            <Pill tone="amber" className={styles.eyebrow}>
              {pendingJournals} nhật ký chờ duyệt
            </Pill>
          )}
          <h1 className={styles.pageTitle}>
            {getGreeting()}, {session.user.name || 'Cán bộ KT'}
          </h1>
          <p className={styles.subtitle}>{formatDate(new Date())}</p>
        </div>
        <div className={styles.headerActions}>
          <Link
            href="/officer/journal"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors shadow-sm text-sm"
          >
            + Tạo nhật ký
          </Link>
        </div>
      </header>

      <section className={styles.metricGrid} data-testid="officer-metric-grid">
        <MetricCard
          icon={<AlertCircle />}
          label="Chờ duyệt"
          value={pendingJournals}
          tone="amber"
        />
        <MetricCard
          icon={<Map />}
          label="Thửa đất đang canh tác"
          value={activeParcels}
          tone="green"
        />
        <MetricCard
          icon={<PackageCheck />}
          label="Lô sẵn sàng"
          value={readyLots}
          tone="blue"
        />
        <MetricCard
          icon={<FileText />}
          label="Nông hộ quản lý"
          value={totalHouseholds}
          tone="green"
        />
      </section>

      <section className={styles.scheduleSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Nhật ký gần đây</h2>
          <Link
            href="/officer/journal"
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            Xem tất cả →
          </Link>
        </div>
        {recentEntries.length === 0 ? (
          <p style={{ color: 'var(--muted-foreground)', padding: '1rem' }}>
            Chưa có nhật ký nào. Hãy tạo nhật ký canh tác đầu tiên!
          </p>
        ) : (
          <table className={styles.taskTable} data-testid="task-table">
            <thead>
              <tr className={styles.tableHead}>
                <th>Mã thửa</th>
                <th>Cây trồng</th>
                <th>Hoạt động</th>
                <th>Ngày</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.map((entry) => {
                const statusInfo = STATUS_LABELS[entry.status] || { label: entry.status, tone: 'neutral' as const }
                return (
                  <tr key={entry.id} className={styles.tableRow}>
                    <td>{entry.parcel_code}</td>
                    <td>{entry.crop_type}</td>
                    <td>{ACTIVITY_LABELS[entry.activity_type] || entry.activity_type}</td>
                    <td>{new Date(entry.entry_date).toLocaleDateString('vi-VN')}</td>
                    <td>
                      <Pill tone={statusInfo.tone}>{statusInfo.label}</Pill>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
