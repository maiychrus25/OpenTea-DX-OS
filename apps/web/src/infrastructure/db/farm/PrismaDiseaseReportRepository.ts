// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client';
import { DiseaseReportPort, DiseaseReportData } from '@/domain/disease/ports/disease-report.port';

export class PrismaDiseaseReportRepository implements DiseaseReportPort {
  async save(data: DiseaseReportData) {
    const report = await prisma.diseaseReport.create({
      data: {
        parcel_id: data.parcel_id,
        household_id: data.household_id,
        detected_by_id: data.detected_by_id,
        detection_date: data.detection_date,
        photo_url: data.photo_url,
        photo_minio_key: data.photo_minio_key,
        ai_disease_name: data.ai_disease_name,
        ai_confidence: data.ai_confidence,
      },
    });

    return {
      id: report.id,
      ai_disease_name: report.ai_disease_name,
      ai_confidence: report.ai_confidence,
      photo_url: report.photo_url,
      created_at: report.created_at,
    };
  }

  async findLatestByParcelId(parcelId: string): Promise<{ photo_minio_key: string; detection_date: Date } | null> {
    const report = await prisma.diseaseReport.findFirst({
      where: { parcel_id: parcelId },
      orderBy: { detection_date: 'desc' },
      select: { photo_minio_key: true, detection_date: true }
    });
    return report;
  }
}
