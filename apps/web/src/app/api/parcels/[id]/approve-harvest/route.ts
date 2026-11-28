// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ApproveHarvestUseCase } from '@/application/farm/approve-harvest-usecase'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { ForbiddenError } from '@/domain/errors'

async function approveHarvest(_request: Request, context: unknown) {
  const tenant = await requireTenant()
  if (tenant.role !== 'officer' && tenant.role !== 'manager') {
    throw new ForbiddenError('Chỉ cán bộ hoặc quản lý mới có quyền duyệt thu hoạch')
  }
  const { id } = await (context as { params: Promise<{ id: string }> | { id: string } }).params
  await new TenantGuard(tenant).parcel(id)

  const useCase = new ApproveHarvestUseCase(new PrismaParcelRepository(), new PrismaJournalRepository(), new PrismaNotificationRepository())
  const parcel = await useCase.execute(id, tenant.userId, tenant.role)
  return NextResponse.json({ data: { parcel } }, { status: 200 })
}

export const POST = withErrorHandler(approveHarvest)
