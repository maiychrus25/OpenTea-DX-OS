// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformAdmin } from '@/lib/api/platform'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { BuildDiseaseDatasetUseCase } from '@/application/disease/build-disease-dataset.usecase'
import { PrismaDiseaseDatasetRepository } from '@/infrastructure/db/farm/PrismaDiseaseDatasetRepository'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  since: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  htx: z.string().trim().min(1).max(32).optional(),
  cursor: z.string().min(1).max(200).optional(),
})

/** Field-photo manifest for training the tea model: platform admin only, consenting cooperatives only. */
async function getDataset(request: Request) {
  await requirePlatformAdmin()
  const params = new URL(request.url).searchParams
  const query = querySchema.parse({ since: params.get('since') ?? undefined, htx: params.get('htx') ?? undefined, cursor: params.get('cursor') ?? undefined })
  const manifest = await new BuildDiseaseDatasetUseCase(new PrismaDiseaseDatasetRepository(), new MinioStorageAdapter()).execute({
    since: query.since ? new Date(query.since) : undefined,
    htxCode: query.htx,
    cursor: query.cursor,
  })
  return NextResponse.json(manifest, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = withErrorHandler(getDataset)
