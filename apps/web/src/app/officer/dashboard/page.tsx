// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { redirect } from 'next/navigation'
import { Home, Sprout, BookOpen, HeartPulse } from 'lucide-react'

import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { NotFoundError } from '@/domain/errors'
import { auth } from '@/auth'
import { MetricCard, Pill } from '@/components/ui'

import styles from './officer-dashboard.module.css'

function getGreeting(): string {
  const now = new Date()
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
  const hour = vnTime.getHours()
  if (hour < 12) return 'Chào buổi sáng'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

export default async function OfficerDashboard() {
  const session = await auth()
  if (!session || session.user?.role !== 'officer') {
    redirect('/login')
  }

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)

  let hasProfile = false
  let profileId = ''

  try {
    const profile = await useCase.execute()
    hasProfile = true
    profileId = profile.id
  } catch (error) {
    if (error instanceof NotFoundError) {
      hasProfile = false
    } else {
      throw error
    }
  }

  let householdCount = 0
  let parcelCount = 0
  let pendingJournals = 0
  let diseaseReports = 0

  if (hasProfile && profileId) {
    const [households, parcels, journals, diseases] = await Promise.all([
      prisma.household.count({
        where: { htx_profile_id: profileId }
      }),
      prisma.parcel.count({
        where: { household: { htx_profile_id: profileId } }
      }),
      prisma.journalEntry.count({
        where: {
          parcel: { household: { htx_profile_id: profileId } },
          status: 'PENDING_APPROVAL'
        }
      }),
      prisma.diseaseReport.count({
        where: {
          household: { htx_profile_id: profileId },
          status: 'PENDING'
        }
      })
    ])

    householdCount = households
    parcelCount = parcels
    pendingJournals = journals
    diseaseReports = diseases
  }

  return (
    <main className={styles.container}>
      <header className={styles.hero}>
        <h1 className={styles.greeting}>
          {getGreeting()}, {session.user.name || 'Cán bộ kỹ thuật'}
        </h1>
        <Pill tone="amber" className={styles.priorityBadge}>
          5 việc cần ưu tiên
        </Pill>
      </header>

      <section className={styles.metricGrid}>
        <MetricCard
          label="Hộ quản lý"
          value={householdCount.toString()}
          icon={<Home />}
          detail="hộ"
          tone="neutral"
        />
        <MetricCard
          label="Thửa đang theo dõi"
          value={parcelCount.toString()}
          icon={<Sprout />}
          detail="thửa"
          tone="neutral"
        />
        <MetricCard
          label="Nhật ký chờ duyệt"
          value={pendingJournals.toString()}
          icon={<BookOpen />}
          detail={`${pendingJournals} cần xử lý`}
          tone={pendingJournals > 0 ? 'amber' : 'green'}
        />
        <MetricCard
          label="Báo cáo bệnh mới"
          value={diseaseReports.toString()}
          icon={<HeartPulse />}
          detail={`${diseaseReports} cần kiểm tra`}
          tone={diseaseReports > 0 ? 'amber' : 'green'}
        />
      </section>

      <section className={styles.scheduleSection}>
        <h2 className={styles.sectionTitle}>Lịch làm việc hôm nay</h2>
        <table className={styles.placeholderTable}>
          <thead>
            <tr>
              <th>Giờ</th>
              <th>Công việc</th>
              <th>Địa điểm / Hộ</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>08:00 - 09:30</td>
              <td>Kiểm tra thửa P-HTX-001 (Báo cáo bệnh)</td>
              <td>Hộ Nguyễn Văn A</td>
              <td><Pill tone="green">Hoàn thành</Pill></td>
            </tr>
            <tr>
              <td>10:00 - 11:30</td>
              <td>Duyệt 5 nhật ký bón phân định kỳ</td>
              <td>Văn phòng HTX</td>
              <td><Pill tone="amber">Chờ xử lý</Pill></td>
            </tr>
            <tr>
              <td>14:00 - 16:00</td>
              <td>Đánh giá an toàn thu hoạch Lô L-023</td>
              <td>Hộ Lê Thị B</td>
              <td><Pill tone="neutral">Chưa bắt đầu</Pill></td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  )
}
