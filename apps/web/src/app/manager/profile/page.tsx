// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { requireTenant } from '@/lib/api/tenant'
import { auth } from '@/auth'
import { HeadProfile } from './_components/HeadProfile'
import { TrainingConsentSwitch } from './_components/TrainingConsentSwitch'
import { AccountSection } from '@/components/ui'
import { TelegramLinkCard } from '@/components/features/telegram/TelegramLinkCard'
import { PublicNamesSetting } from '@/components/features/certificates/PublicNamesSetting'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from './page.module.css'

async function loadOverview(htxProfileId: string) {
  try {
    const [households, parcels, certificates] = await Promise.all([
      prisma.household.count({ where: { htx_profile_id: htxProfileId } }),
      prisma.parcel.findMany({ where: { household: { htx_profile_id: htxProfileId } }, select: { area_ha: true } }),
      prisma.htxCertificate.count({ where: { htx_profile_id: htxProfileId } }).catch(() => 0),
    ])
    return { households, certificates, parcels: parcels.length, area: parcels.reduce((sum, p) => sum + (p.area_ha || 0), 0) }
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
  return (
    <div className={kit.page}>
      <HeadProfile profile={profile} htxCode={htxCode} userName={session?.user?.name || 'Trưởng HTX'} overview={overview} />

      <div className={styles.columns}>
        <div className={styles.column}>
          <div className={styles.telegram}>
            <TelegramLinkCard role="manager" />
          </div>
          <PublicNamesSetting />
          <TrainingConsentSwitch />
        </div>
        <div className={styles.column}>
          <AccountSection name={session?.user?.name || 'Trưởng HTX'} role="manager" />
        </div>
      </div>
    </div>
  )
}
