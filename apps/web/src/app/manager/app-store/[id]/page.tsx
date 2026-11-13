// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AppStoreUseCase } from '@/application/apps/app-store.usecase'
import { AppStoreError } from '@/domain/entities/app-store'
import { PrismaAppStoreRepository } from '@/infrastructure/db/repositories/prisma-app-store-repository'
import { requireTenant } from '@/lib/api/tenant'
import { AppStoreDetail } from '../_components/AppStoreDetail'

export const metadata = { title: 'Chi tiết ứng dụng' }
export const dynamic = 'force-dynamic'

// Same pattern as "id" in platform/apps/manifest.schema.json.
const APP_ID = /^[a-z][a-z0-9-]{1,30}$/

export default async function ManagerAppStoreDetailPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'manager') redirect('/unauthorized')
  if (!APP_ID.test(params.id)) notFound()

  const tenant = await requireTenant()
  const repository = new PrismaAppStoreRepository()
  try {
    const [initial, workerAlive] = await Promise.all([new AppStoreUseCase(repository).detail(tenant.htxCode, params.id), repository.workerAlive()])
    return <AppStoreDetail initial={initial} workerAlive={workerAlive} />
  } catch (error) {
    if (error instanceof AppStoreError && error.code === 'APP_NOT_FOUND') notFound()
    throw error
  }
}
