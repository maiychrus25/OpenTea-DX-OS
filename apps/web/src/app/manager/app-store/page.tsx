// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AppStoreUseCase } from '@/application/apps/app-store.usecase'
import { PrismaAppStoreRepository } from '@/infrastructure/db/repositories/prisma-app-store-repository'
import { requireTenant } from '@/lib/api/tenant'
import { AppStoreClient } from './_components/AppStoreClient'

export const metadata = { title: 'Kho ứng dụng' }
// The cards show what the worker has done so far, so the page is never built ahead of time.
export const dynamic = 'force-dynamic'

export default async function ManagerAppStorePage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'manager') redirect('/unauthorized')

  const tenant = await requireTenant()
  const initial = await new AppStoreUseCase(new PrismaAppStoreRepository()).list(tenant.htxCode)
  return <AppStoreClient initial={initial} />
}
