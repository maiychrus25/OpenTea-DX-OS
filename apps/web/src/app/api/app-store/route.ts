// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { AppStoreUseCase } from '@/application/apps/app-store.usecase'
import { PrismaAppStoreRepository } from '@/infrastructure/db/repositories/prisma-app-store-repository'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

// Per user and per request, never cached: the page polls this while an install runs.
export const dynamic = 'force-dynamic'

async function getAppStore() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  if (session.user.role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Chỉ trưởng HTX được dùng Kho ứng dụng' } }, { status: 403 })
  }
  const tenant = await requireTenant()
  const data = await new AppStoreUseCase(new PrismaAppStoreRepository()).list(tenant.htxCode)
  return NextResponse.json({ data })
}

export const GET = withErrorHandler(getAppStore)
