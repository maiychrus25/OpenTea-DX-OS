// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { randomUUID } from 'crypto'
import { z } from 'zod'
import { SubmitDiagnosisUseCase } from '@/application/disease/submit-diagnosis.usecase'
import { documentRoot } from '@/domain/document/document-namespace'
import { CoreUnauthorizedError, CoreUnavailableError, DomainError, ForbiddenError, NotFoundError } from '@/domain/errors'
import { localDay } from '@/domain/shared/local-day'
import { WEB_SERVICE_NOT_ENABLED, WebServiceTokenProvider } from '@/infrastructure/auth/web-service-token'
import { PrismaDiseaseReportRepository } from '@/infrastructure/db/farm/PrismaDiseaseReportRepository'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { DiseaseApiAdapter } from '@/infrastructure/disease-api/disease-api.adapter'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'
import { TenantGuard } from '@/lib/api/tenant-guard'
import { TELEGRAM_TEXT } from '../../messages'
import type { ChatAction } from '../types'
import { parcelChoices, parcelCode } from './common'

/** The same limit as `POST /api/diagnosis` (rules-and-limits §2.1). */
const PHOTO_MAX_BYTES = 5 * 1024 * 1024
/** The gateway route for the web's own service token: the user route refuses it, and this one takes nothing else. */
const DISEASE_SERVICE_PATH = '/api/internal/web/disease'
const NOT_FOUND_VI = 'Không tìm thấy thửa này.'
const NOT_IMAGE_VI = 'Ảnh phải là JPEG hoặc PNG.'
const UNAVAILABLE_VI = 'Dịch vụ AI chẩn đoán bệnh đang tạm bảo trì. Vui lòng thử lại sau.'
const OFFICER_CONFIRMS_VI = 'Cán bộ sẽ xác nhận kết quả này.'

const tokens = new WebServiceTokenProvider()

const diseasePhotoRoot = (htxCode: string): string => `${documentRoot(htxCode)}Areas/Telegram/Disease/`

function imageType(bytes: Buffer): 'image/jpeg' | 'image/png' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  return null
}

/** What the route answers in HTTP codes, as the sentence the person reads. */
function refusal(error: unknown): unknown {
  if (error instanceof NotFoundError || error instanceof ForbiddenError) {
    return error instanceof NotFoundError ? new DomainError(NOT_FOUND_VI) : new DomainError(WEB_SERVICE_NOT_ENABLED)
  }
  if (error instanceof CoreUnauthorizedError) return new DomainError(WEB_SERVICE_NOT_ENABLED)
  if (error instanceof CoreUnavailableError) return new DomainError(UNAVAILABLE_VI)
  if (error instanceof Error) {
    if (['PARCEL_NOT_FOUND', 'HOUSEHOLD_NOT_FOUND', 'FORBIDDEN_PARCEL'].includes(error.message)) return new DomainError(NOT_FOUND_VI)
    if (/Disease API|fetch failed|ECONNREFUSED/.test(error.message)) return new DomainError(UNAVAILABLE_VI)
  }
  return error
}

type DiseaseReportPayload = { parcel_id: string; photo_key: string }

/**
 * Route: `POST /api/diagnosis`, for a farmer. The route reads the farmer's session; chat has none, so the disease API is
 * called with the web's own service token (client `dxos-web-service`) through the internal gateway route. The parcel
 * checks are the route's: the tenant guard, then the use case's household owner check.
 */
export const diseaseReportAction: ChatAction<DiseaseReportPayload> = {
  name: 'disease.report',
  titleVi: 'Chẩn đoán bệnh',
  risk: 'medium',
  roles: ['farmer'],
  routes: ['POST /api/diagnosis'],
  args: [{ name: 'parcel_id', type: 'string', descriptionVi: 'Mã thửa, ví dụ TC-A1' }],
  steps: [
    { kind: 'choice', slot: 'parcel_id', promptVi: 'Chọn thửa có cây bị bệnh:', choices: (user) => parcelChoices(user) },
    {
      kind: 'photo',
      slot: 'photo_key',
      promptVi: 'Gửi ảnh lá chè bị bệnh, chụp rõ một lá.',
      optional: false,
      photoKey: (user) => `${diseasePhotoRoot(user.tenant.htxCode)}${localDay(new Date()).slice(0, 4)}/${randomUUID()}-telegram.jpg`,
    },
  ],
  payloadSchema: z.object({ parcel_id: z.string().min(1), photo_key: z.string().min(1) }),
  consequenceVi: null,
  async preview(payload, user) {
    return [`Gửi ảnh thửa ${await parcelCode(user, payload.parcel_id)} để chẩn đoán`]
  },
  async execute(payload, user, deps) {
    await new TenantGuard(user.tenant).parcel(payload.parcel_id).catch((error) => {
      throw refusal(error)
    })
    if (!payload.photo_key.startsWith(diseasePhotoRoot(user.tenant.htxCode))) throw new DomainError(TELEGRAM_TEXT.photoFailed)

    const bytes = await deps.photos.get(payload.photo_key)
    if (bytes.length > PHOTO_MAX_BYTES) throw new DomainError(TELEGRAM_TEXT.photoTooLarge)
    const mimeType = imageType(bytes)
    if (!mimeType) throw new DomainError(NOT_IMAGE_VI)

    const token = await tokens.get()
    let result: Awaited<ReturnType<SubmitDiagnosisUseCase['execute']>>
    try {
      result = await new SubmitDiagnosisUseCase(
        new DiseaseApiAdapter(token, DISEASE_SERVICE_PATH),
        new MinioStorageAdapter(),
        new PrismaParcelRepository(),
        new PrismaDiseaseReportRepository(),
        new PrismaNotificationRepository()
      ).execute({
        farmerUserId: user.tenant.userId,
        htxCode: user.tenant.htxCode,
        parcelId: payload.parcel_id,
        imageBlob: new Blob([new Uint8Array(bytes)], { type: mimeType }),
        imageBuffer: bytes,
        mimeType,
      })
    } catch (error) {
      throw refusal(error)
    }

    // The report keeps its own copy of the photo, so the chat copy is only a stopover.
    try {
      await deps.photos.delete(payload.photo_key)
    } catch {
      // A copy that stays is harmless: the report already holds the photo.
    }
    return `${result.disease_name} (${(result.confidence_score * 100).toFixed(1)}%)\n${OFFICER_CONFIRMS_VI}`
  },
}
