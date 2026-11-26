// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { requireTenant } from '@/lib/api/tenant'
import { ProfileForm } from './_components/ProfileForm'
import { AccountSection } from '@/components/ui'
import { TelegramLinkCard } from '@/components/features/telegram/TelegramLinkCard'
import { CertificateManager } from '@/components/features/certificate/CertificateManager'
import { Landmark } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import styles from './page.module.css'

export default async function HtxProfilePage() {
  const { htxCode } = await requireTenant()
  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)

  // F4: Handle NotFoundError gracefully — do not crash the page
  let profile = null
  try {
    profile = await useCase.execute(htxCode)
  } catch {
    // Profile not found or DB unavailable — render empty state
  }

  return (
    <div className={styles.container}>
      <section aria-label="Hồ sơ HTX">
        <PageHeader
          icon={<Landmark size={28} />}
          title="Thông tin Hợp tác xã"
          description="Quản lý và cập nhật thông tin chung của hợp tác xã"
        />
        
        {/* Mock HTX Stats Grid from AC-1 */}
        <div className={styles.mockStatsGrid}>
          <div className={styles.mockStatItem}>
            <div className={styles.mockStatValue}>24.8 ha</div>
            <div className={styles.mockStatLabel}>Tổng diện tích</div>
          </div>
          <div className={styles.mockStatItem}>
            <div className={styles.mockStatValue}>42</div>
            <div className={styles.mockStatLabel}>Thửa đất</div>
          </div>
          <div className={styles.mockStatItem}>
            <div className={styles.mockStatValue}>18</div>
            <div className={styles.mockStatLabel}>Hộ thành viên</div>
          </div>
        </div>

        <ProfileForm initialData={profile} />
      </section>
      
      <section aria-label="Chứng nhận HTX">
        <CertificateManager mode="manage" />
      </section>
      
      <TelegramLinkCard role="manager" />

      <AccountSection name="Nguyễn Văn An" role="manager" />
    </div>
  )
}
