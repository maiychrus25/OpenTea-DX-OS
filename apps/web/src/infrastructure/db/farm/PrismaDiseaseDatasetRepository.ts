// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import type { ConsentedDiseaseReport, ConsentedDiseaseSource, DatasetCursor } from '@/application/disease/build-disease-dataset.usecase'

export class PrismaDiseaseDatasetRepository implements ConsentedDiseaseSource {
  async findConsented({ since, htxCode, after, limit }: { since?: Date; htxCode?: string; after?: DatasetCursor; limit: number }): Promise<ConsentedDiseaseReport[]> {
    const rows = await prisma.diseaseReport.findMany({
      where: {
        status: 'CONFIRMED',
        confirmed_label_code: { not: null },
        photo_minio_key: { not: '' },
        AND: [
          ...(since ? [{ confirmed_at: { gt: since } }] : []),
          ...(after ? [{ OR: [{ confirmed_at: { gt: after.confirmed_at } }, { confirmed_at: after.confirmed_at, id: { gt: after.id } }] }] : []),
        ],
        household: { htx_profile: { disease_training_consent: true, ...(htxCode ? { htx_code: htxCode } : {}) } },
      },
      orderBy: [{ confirmed_at: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true, household_id: true, confirmed_label_code: true, confirmed_at: true, photo_minio_key: true, household: { select: { htx_profile: { select: { htx_code: true } } } } },
    })
    return rows.flatMap((r) =>
      r.confirmed_label_code && r.confirmed_at && r.household.htx_profile
        ? [{ report_id: r.id, household_id: r.household_id, label_code: r.confirmed_label_code, htx_code: r.household.htx_profile.htx_code, confirmed_at: r.confirmed_at, photo_minio_key: r.photo_minio_key }]
        : []
    )
  }
}
