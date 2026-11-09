// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { CoreUnauthorizedError, CoreUnavailableError, ForbiddenError, NoHtxError, NotFoundError } from '@/domain/errors'
import { SubmitDiagnosisUseCase } from '@/application/disease/submit-diagnosis.usecase'
import { DiseaseApiAdapter } from '@/infrastructure/disease-api/disease-api.adapter'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaDiseaseReportRepository } from '@/infrastructure/db/farm/PrismaDiseaseReportRepository'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { getCoreToken } from '@/lib/auth/core-token'
import { diagnosisSchema } from '@/lib/validations/diagnosis.schema'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB — rules-and-limits.md §2.1
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png'])


export async function POST(req: Request) {
  // ── Auth check (server-side) — rules-and-limits.md §4 ───────────────
  const session = await auth()
  if (!session || !session.user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    )
  }

  // Farmer role required
  if (session.user.role !== 'farmer') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only farmers can submit disease diagnosis' } },
      { status: 403 },
    )
  }

  try {
    // ── Parse multipart form data ─────────────────────────────────────
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    const rawParcelId = formData.get('parcel_id') as string | null

    if (!file) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Image file is required' } },
        { status: 400 },
      )
    }

    // ── Validate content type & size ──────────────────────────────────
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Only JPEG and PNG images are accepted.' } },
        { status: 400 },
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: `File too large. Maximum is 5MB.` } },
        { status: 400 },
      )
    }

    // ── Validate parcel ID with Zod ───────────────────────────────────
    const parseResult = diagnosisSchema.safeParse({ parcel_id: rawParcelId })
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid parcel ID format' } },
        { status: 400 },
      )
    }

    const { parcel_id } = parseResult.data
    const tenant = await requireTenant()
    await new TenantGuard(tenant).parcel(parcel_id)

    // ── Convert File to Buffer and Blob ───────────────────────────────
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const blob = new Blob([arrayBuffer], { type: file.type })

    // ── Instantiate Adapters & Use Case ───────────────────────────────
    const diseaseAdapter = new DiseaseApiAdapter(await getCoreToken())
    const storageAdapter = new MinioStorageAdapter()
    const parcelPort = new PrismaParcelRepository()
    const diseaseReportPort = new PrismaDiseaseReportRepository()
    const notificationPort = new PrismaNotificationRepository()
    const useCase = new SubmitDiagnosisUseCase(
      diseaseAdapter, 
      storageAdapter, 
      parcelPort, 
      diseaseReportPort, 
      notificationPort
    )

    // ── Execute Use Case ──────────────────────────────────────────────
    const result = await useCase.execute({
      farmerUserId: session.user.id!,
      htxCode: tenant.htxCode,
      parcelId: parcel_id,
      imageBlob: blob,
      imageBuffer: buffer,
      mimeType: file.type,
    })

    return NextResponse.json({ data: result })

  } catch (error: unknown) {
    if (error instanceof NoHtxError) {
      return NextResponse.json({ error: { code: 'NO_HTX', message: error.message } }, { status: 403 })
    }
    if (error instanceof CoreUnauthorizedError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: 401 })
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: error.message } }, { status: 403 })
    }
    if (error instanceof CoreUnavailableError) {
      return NextResponse.json(
        { error: { code: 'AI_UNAVAILABLE', message: 'Dịch vụ AI chẩn đoán bệnh đang tạm bảo trì. Vui lòng thử lại sau.' } },
        { status: 503 },
      )
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Parcel not found' } }, { status: 404 })
    }
    if (error instanceof Error) {
      if (error.message === 'HOUSEHOLD_NOT_FOUND' || error.message === 'FORBIDDEN_PARCEL') {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'You do not have access to this parcel' } },
          { status: 403 },
        )
      }
      if (error.message === 'PARCEL_NOT_FOUND') {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Parcel not found' } },
          { status: 404 },
        )
      }
      if (error.message.includes('Disease API') || error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        return NextResponse.json(
          { error: { code: 'AI_UNAVAILABLE', message: 'Dịch vụ AI chẩn đoán bệnh đang tạm bảo trì. Vui lòng thử lại sau.' } },
          { status: 503 },
        )
      }
    }

    console.error('Diagnosis Error:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
