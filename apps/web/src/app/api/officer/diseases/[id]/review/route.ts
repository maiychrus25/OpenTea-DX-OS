// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requireTenant } from '@/lib/api/tenant';
import { TenantGuard } from '@/lib/api/tenant-guard';
import { NoHtxError, NotFoundError } from '@/domain/errors';
import { PrismaDiseaseReportRepository } from '@/infrastructure/db/farm/PrismaDiseaseReportRepository';
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository';
import { ReviewDiseaseReportUseCase } from '@/application/disease/review-disease-report.usecase';
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter';
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter';
import { PrismaDiseaseLabelRepository } from '@/infrastructure/db/farm/PrismaDiseaseLabelRepository';
import { PrismaPesticideRepository } from '@/infrastructure/db/pesticide/PrismaPesticideRepository';
import { z } from 'zod';

const reviewSchema = z.object({
  status: z.enum(['CONFIRMED', 'REJECTED']),
  treatment_recommendation: z.string().optional(),
  confirmed_diagnosis: z.string().trim().max(200, 'Tên bệnh tối đa 200 ký tự.').optional(),
  confirmed_label_code: z.string().trim().max(64).optional(),
  prescription: z.object({
    pesticide_product_id: z.string().min(1).max(100),
    dosage: z.string().trim().max(100).optional()
  }).optional()
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || !session.user || session.user.role !== 'officer') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only officers can review reports' } },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const parsed = reviewSchema.safeParse(body);
    
    if (!parsed.success) {
      const nameIssue = parsed.error.issues.find((issue) => issue.path[0] === 'confirmed_diagnosis');
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: nameIssue?.message ?? 'Invalid input data' } },
        { status: 400 }
      );
    }

    const { status, treatment_recommendation, confirmed_diagnosis, confirmed_label_code, prescription } = parsed.data;

    const tenant = await requireTenant();
    await new TenantGuard(tenant).diseaseReport(params.id);

    const useCase = new ReviewDiseaseReportUseCase(
      new PrismaDiseaseReportRepository(),
      new PrismaNotificationRepository(),
      new MinioStorageAdapter(),
      new MinioDocumentAdapter(),
      new PrismaPesticideRepository(),
      new PrismaDiseaseLabelRepository()
    );

    const result = await useCase.execute({
      reportId: params.id,
      officerId: session.user.id!,
      htxCode: tenant.htxCode,
      status,
      treatment_recommendation: treatment_recommendation || '',
      confirmed_diagnosis: confirmed_diagnosis ?? '',
      confirmed_label_code,
      prescription: prescription ? { pesticideProductId: prescription.pesticide_product_id, dosage: prescription.dosage } : undefined,
      htxProfileId: tenant.htxProfileId,
      officerName: session.user.name ?? undefined
    });

    return NextResponse.json({ success: true, data: { draftJournalEntryId: result.draftJournalEntryId } });
  } catch (error: any) {
    if (error instanceof NoHtxError) {
      return NextResponse.json({ error: { code: 'NO_HTX', message: error.message } }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Report not found' } }, { status: 404 });
    }
    console.error('[Officer Review Disease API]', error);

    if (error.message === 'REPORT_NOT_FOUND') {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Report not found' } }, { status: 404 });
    }
    if (error.message === 'INVALID_STATUS_TRANSITION') {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Report is no longer pending' } }, { status: 400 });
    }
    if (error.message === 'TREATMENT_REQUIRED') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Treatment recommendation is required for approval' } }, { status: 400 });
    }
    if (error.message === 'PRESCRIPTION_REQUIRES_CONFIRMED') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Chỉ kê đơn khi xác nhận ca bệnh.' } }, { status: 400 });
    }
    if (error.message === 'PESTICIDE_NOT_FOUND') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Không tìm thấy thuốc trong danh mục.' } }, { status: 400 });
    }
    if (error.message === 'DIAGNOSIS_REQUIRED') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Vui lòng nhập tên bệnh đã xác nhận trước khi duyệt.' } }, { status: 400 });
    }
    if (error.message === 'LABEL_REQUIRED') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Vui lòng chọn nhãn bệnh/sâu trước khi duyệt.' } }, { status: 400 });
    }
    if (error.message === 'LABEL_UNKNOWN') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Nhãn bệnh/sâu không có trong danh sách.' } }, { status: 400 });
    }

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
