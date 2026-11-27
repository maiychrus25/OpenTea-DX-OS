// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import Link from 'next/link'
import { Eye, Landmark, Leaf } from 'lucide-react'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { requireTenant } from '@/lib/api/tenant'
import { auth } from '@/auth'
import { ProfileForm } from './_components/ProfileForm'
import { AccountSection } from '@/components/ui'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { TelegramLinkCard } from '@/components/features/telegram/TelegramLinkCard'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from './page.module.css'

async function loadOverview(htxProfileId: string) {
  try {
    const [households, parcels] = await Promise.all([
      prisma.household.count({ where: { htx_profile_id: htxProfileId } }),
      prisma.parcel.findMany({ where: { household: { htx_profile_id: htxProfileId } }, select: { area_ha: true } }),
    ])
    return { households, parcels: parcels.length, area: parcels.reduce((sum, p) => sum + (p.area_ha || 0), 0) }
  } catch {
    return null
  }
}

export default async function HtxProfilePage() {
  const { htxCode } = await requireTenant()
  const session = await auth()
  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)

  // F4: Handle NotFoundError gracefully — do not crash the page
  let profile = null
  try {
    profile = await useCase.execute(htxCode)
  } catch {
    // Profile not found or DB unavailable — render empty state
  }
  const overview = profile ? await loadOverview(profile.id) : null
  const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Landmark size={28} />}
        title="Hồ sơ HTX"
        description="Thông tin liên hệ, hiển thị trên trang truy xuất và gian hàng công khai"
        actions={
          <Link href={`/htx/${encodeURIComponent(htxCode)}`} className={kit.secondary}>
            <Eye size={16} aria-hidden="true" /> Xem gian hàng công khai
          </Link>
        }
      />

      <div className={styles.columns}>
        <div className={styles.column}>
          <section aria-label="Hồ sơ HTX">
            <ProfileForm initialData={profile} />
          </section>
        </div>

        <div className={styles.column}>
          <Panel title="Tổng quan HTX">
            <div className={styles.identity}>
              <span className={styles.logo} aria-hidden="true"><Leaf size={32} /></span>
              <div>
                <strong>{profile?.name ?? 'Chưa có hồ sơ'}</strong>
                <small>Mã HTX: {htxCode}</small>
              </div>
            </div>
            {overview && (
              <dl className={styles.stats}>
                <div><dt>Diện tích thửa</dt><dd>{number(overview.area)} ha</dd></div>
                <div><dt>Thửa đất</dt><dd>{number(overview.parcels)}</dd></div>
                <div><dt>Hộ thành viên</dt><dd>{number(overview.households)}</dd></div>
              </dl>
            )}
          </Panel>

          <div className={styles.telegram}>
            <TelegramLinkCard role="manager" />
          </div>

          <AccountSection name={session?.user?.name || 'Trưởng HTX'} role="manager" />
        </div>
      </div>
    </div>
  )
}
