// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { ReviewDiseaseReportUseCase } from '@/application/disease/review-disease-report.usecase'
import { DomainError } from '@/domain/errors'
import { PrismaDiseaseReportRepository } from '@/infrastructure/db/farm/PrismaDiseaseReportRepository'
import { PrismaDiseaseLabelRepository } from '@/infrastructure/db/farm/PrismaDiseaseLabelRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ChatAction, ChatUser, Choice } from '../types'
import { MAX_CHOICES, clip, inCooperative, notFound } from './scope'

const DECISIONS = [
  { value: 'CONFIRMED', label: 'Xác nhận' },
  { value: 'REJECTED', label: 'Từ chối' },
] as const

type DiseaseReviewPayload = { report_id: string; decision: 'CONFIRMED' | 'REJECTED'; label_code?: string; note: string }

const payloadSchema = z
  .object({
    report_id: z.string().min(1),
    decision: z.enum(['CONFIRMED', 'REJECTED']),
    label_code: z.string().min(1).max(64).optional(),
    note: z.string().trim().min(1).max(500),
  })
  .refine((p) => p.decision !== 'CONFIRMED' || p.label_code, { message: 'Cần chọn nhãn bệnh/sâu', path: ['label_code'] })

/** What the use case throws as bare codes, said in words. */
const USE_CASE_ERROR_VI: Record<string, string> = {
  REPORT_NOT_FOUND: 'Không tìm thấy báo cáo.',
  INVALID_STATUS_TRANSITION: 'Báo cáo này đã được xử lý.',
  TREATMENT_REQUIRED: 'Cần nhập hướng dẫn xử lý.',
  DIAGNOSIS_REQUIRED: 'Báo cáo chưa có tên bệnh để xác nhận.',
  LABEL_REQUIRED: 'Cần chọn nhãn bệnh/sâu.',
  LABEL_UNKNOWN: 'Nhãn bệnh/sâu không có trong danh sách.',
}

/** One report of the user's cooperative; the route's `TenantGuard.diseaseReport` as a read. */
async function reportOf(user: ChatUser, id: string) {
  const report = await prisma.diseaseReport.findFirst({
    where: { id, household: { htx_profile_id: user.tenant.htxProfileId } },
    select: { id: true, ai_disease_name: true, status: true, parcel: { select: { parcel_code: true } } },
  })
  if (!report) throw notFound()
  return report
}

async function labelOf(code: string) {
  return (await new PrismaDiseaseLabelRepository().list()).find((l) => l.code === code)
}

async function pendingChoices(user: ChatUser): Promise<Choice[]> {
  const reports = await prisma.diseaseReport.findMany({
    where: { status: 'PENDING', household: { htx_profile_id: user.tenant.htxProfileId } },
    orderBy: { created_at: 'desc' },
    take: MAX_CHOICES,
    select: { id: true, ai_disease_name: true, parcel: { select: { parcel_code: true } } },
  })
  return reports.map((r) => ({ value: r.id, label: `${r.parcel.parcel_code} · ${r.ai_disease_name}` }))
}

/**
 * Routes: `PUT /api/officer/diseases/[id]/review`. The route admits officers only, so managers are refused here too.
 * Confirming takes a label from `disease_labels`, whose Vietnamese name is the confirmed name; the typed note is the treatment advice (or the reason).
 */
export const diseaseReviewAction: ChatAction<DiseaseReviewPayload> = {
  name: 'disease.review',
  titleVi: 'Duyệt báo cáo bệnh',
  risk: 'medium',
  roles: ['officer'],
  routes: ['PUT /api/officer/diseases/[id]/review'],
  args: [],
  async start(user) {
    return (await pendingChoices(user)).length ? { state: {} } : { replyVi: 'Không có báo cáo bệnh nào đang chờ duyệt.' }
  },
  steps: [
    { kind: 'choice', slot: 'report_id', promptVi: 'Chọn báo cáo bệnh:', choices: (user) => pendingChoices(user) },
    { kind: 'choice', slot: 'decision', promptVi: 'Quyết định:', choices: async () => [...DECISIONS] },
    {
      kind: 'choice',
      slot: 'label_code',
      promptVi: 'Chọn nhãn bệnh/sâu:',
      when: (state) => state.decision === 'CONFIRMED',
      choices: async () => (await new PrismaDiseaseLabelRepository().list()).map((l) => ({ value: l.code, label: l.name_vi })),
    },
    { kind: 'text', slot: 'note', promptVi: 'Nhập hướng dẫn xử lý (hoặc lý do từ chối):', maxLength: 500 },
  ],
  payloadSchema,
  consequenceVi: null,
  async preview(payload, user) {
    const report = await reportOf(user, payload.report_id)
    const label = payload.label_code ? await labelOf(payload.label_code) : null
    return [
      `Thửa: ${report.parcel.parcel_code}`,
      `Bệnh (AI): ${report.ai_disease_name}`,
      `Quyết định: ${DECISIONS.find((d) => d.value === payload.decision)?.label}`,
      ...(label ? [`Nhãn: ${label.name_vi}`] : []),
      `Ghi chú: ${clip(payload.note)}`,
    ]
  },
  async execute(payload, user) {
    await inCooperative(new TenantGuard(user.tenant).diseaseReport(payload.report_id))
    await reportOf(user, payload.report_id)
    const label = payload.decision === 'CONFIRMED' && payload.label_code ? await labelOf(payload.label_code) : undefined
    if (payload.decision === 'CONFIRMED' && !label) throw new DomainError(USE_CASE_ERROR_VI.LABEL_UNKNOWN)
    try {
      await new ReviewDiseaseReportUseCase(
        new PrismaDiseaseReportRepository(),
        new PrismaNotificationRepository(),
        new MinioStorageAdapter(),
        new MinioDocumentAdapter(),
        undefined,
        new PrismaDiseaseLabelRepository()
      ).execute({
        reportId: payload.report_id,
        officerId: user.tenant.userId,
        htxCode: user.tenant.htxCode,
        status: payload.decision,
        treatment_recommendation: payload.note,
        confirmed_diagnosis: label?.name_vi ?? '',
        confirmed_label_code: label?.code,
      })
    } catch (err) {
      const known = err instanceof Error ? USE_CASE_ERROR_VI[err.message] : undefined
      throw known ? new DomainError(known) : err
    }
    return payload.decision === 'CONFIRMED' ? 'Đã xác nhận báo cáo bệnh.' : 'Đã từ chối báo cáo bệnh.'
  },
}
