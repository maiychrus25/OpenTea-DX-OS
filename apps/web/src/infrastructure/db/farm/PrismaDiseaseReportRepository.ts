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

  async findHistoryByFarmer(farmerId: string) {
    const reports = await prisma.diseaseReport.findMany({
      where: { detected_by_id: farmerId },
      orderBy: { detection_date: 'desc' },
      include: {
        parcel: {
          select: {
            parcel_code: true
          }
        }
      }
    });

    return reports.map(r => ({
      id: r.id,
      detection_date: r.detection_date,
      photo_minio_key: r.photo_minio_key,
      ai_disease_name: r.ai_disease_name,
      ai_confidence: r.ai_confidence,
      status: r.status,
      parcel_code: r.parcel.parcel_code,
      treatment_recommendation: r.treatment_recommendation
    }));
  }

  async findPendingReports() {
    const reports = await prisma.diseaseReport.findMany({
      where: { status: 'PENDING' },
      orderBy: { detection_date: 'asc' },
      include: {
        parcel: { select: { parcel_code: true } },
        household: { select: { name: true } }
      }
    });

    return reports.map(r => ({
      id: r.id,
      detection_date: r.detection_date,
      photo_minio_key: r.photo_minio_key,
      ai_disease_name: r.ai_disease_name,
      ai_confidence: r.ai_confidence,
      farmer_name: r.household.name,
      parcel_code: r.parcel.parcel_code,
      photo_url: r.photo_url
    }));
  }

  async findById(id: string) {
    const report = await prisma.diseaseReport.findUnique({
      where: { id },
      include: {
        parcel: { select: { parcel_code: true } },
        household: { select: { name: true } }
      }
    });

    if (!report) return null;

    return {
      id: report.id,
      detection_date: report.detection_date,
      photo_minio_key: report.photo_minio_key,
      ai_disease_name: report.ai_disease_name,
      ai_confidence: report.ai_confidence,
      status: report.status,
      treatment_recommendation: report.treatment_recommendation,
      farmer_id: report.detected_by_id,
      farmer_name: report.household.name,
      parcel_code: report.parcel.parcel_code
    };
  }

  async updateStatus(id: string, status: any, treatment: string, officerId: string): Promise<void> {
    await prisma.diseaseReport.update({
      where: { id },
      data: {
        status: status,
        treatment_recommendation: treatment,
        confirmed_by_id: officerId,
        confirmed_at: new Date()
      }
    });
  }
}
