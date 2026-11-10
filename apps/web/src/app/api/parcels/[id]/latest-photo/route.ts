// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { NoHtxError, NotFoundError } from '@/domain/errors'
import { GetParcelPhotoUseCase } from '@/application/farm/GetParcelPhotoUseCase'
import { PrismaDiseaseReportRepository } from '@/infrastructure/db/farm/PrismaDiseaseReportRepository'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  // Security Check (HIGH bug fix)
  const session = await auth()
  if (!session || !session.user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    )
  }

  try {
    const parcelId = params.id
    await new TenantGuard(await requireTenant()).parcel(parcelId)

    // Hexagonal Architecture (HIGH bug fix)
    const diseaseReportRepo = new PrismaDiseaseReportRepository()
    const storageRepo = new MinioStorageAdapter()
    const useCase = new GetParcelPhotoUseCase(diseaseReportRepo, storageRepo)

    const result = await useCase.execute(parcelId)

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof NoHtxError) {
      return NextResponse.json({ error: { code: 'NO_HTX', message: error.message } }, { status: 403 })
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Parcel not found' } }, { status: 404 })
    }
    console.error('[GET /api/parcels/[id]/latest-photo]', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
