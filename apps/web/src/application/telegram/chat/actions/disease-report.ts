// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { randomUUID } from 'crypto'
import { z } from 'zod'
import { SubmitDiagnosisUseCase } from '@/application/disease/submit-diagnosis.usecase'
import { displayDiseaseName } from '@/domain/disease/display-disease-name'
import { localDay } from '@/domain/shared/local-day'
import { DiseaseApiAdapter } from '@/infrastructure/disease-api/disease-api.adapter'
import { PrismaDiseaseReportRepository } from '@/infrastructure/db/farm/PrismaDiseaseReportRepository'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'
import { getCoreToken } from '@/lib/auth/core-token'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ChatAction } from '../types'
import { parcelChoices, parcelCode } from './common'

type DiseaseReportPayload = { parcel_id: string; photo_key: string }

const payloadSchema = z.object({
  parcel_id: z.string().min(1),
  photo_key: z.string().min(1),
})

/** Routes: `POST /api/diagnosis`, farmer only, the same submit the web uses. */
export const diseaseReportAction: ChatAction<DiseaseReportPayload> = {
  name: 'disease.report',
  titleVi: 'Gửi ảnh bệnh',
  risk: 'low',
  roles: ['farmer'],
  routes: ['POST /api/diagnosis'],
  args: [{ name: 'parcel_id', type: 'string', descriptionVi: 'Mã thửa, ví dụ TC-A1' }],
  steps: [
    { kind: 'choice', slot: 'parcel_id', promptVi: 'Chọn thửa:', choices: (user) => parcelChoices(user) },
    {
      kind: 'photo',
      slot: 'photo_key',
      promptVi: 'Gửi ảnh lá chè bị bệnh, chụp rõ một lá.',
      optional: false,
      photoKey: (user) => `telegram/${user.tenant.htxCode}/${localDay(new Date()).slice(0, 4)}/${randomUUID()}.jpg`,
    },
  ],
  payloadSchema,
  consequenceVi: null,
  async preview(payload, user) {
    return [`Thửa: ${await parcelCode(user, payload.parcel_id)}`, 'Ảnh: có']
  },
  async execute(payload, user, deps) {
    await new TenantGuard(user.tenant).parcel(payload.parcel_id)
    const bytes = await deps.photos.get(payload.photo_key)
    const result = await new SubmitDiagnosisUseCase(
      new DiseaseApiAdapter(await getCoreToken()),
      new MinioStorageAdapter(),
      new PrismaParcelRepository(),
      new PrismaDiseaseReportRepository(),
      new PrismaNotificationRepository()
    ).execute({
      farmerUserId: user.tenant.userId,
      htxCode: user.tenant.htxCode,
      parcelId: payload.parcel_id,
      imageBlob: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
      imageBuffer: bytes,
      mimeType: 'image/jpeg',
    })
    if (result.uncertain || !result.disease_name) return 'Đã gửi ảnh. Cán bộ sẽ xem lại.'
    const disease = displayDiseaseName({ confirmed_diagnosis: null, ai_disease_name: result.disease_name })
    return `Đã gửi ảnh. AI nhận định: ${disease} (${Math.round(result.confidence_score * 100)}%). Cán bộ sẽ xem lại.`
  },
}
