// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PrismaClient, NotificationType } from '@prisma/client'
import { DiseaseDetectionPort } from '@/domain/disease/ports/disease-detection.port'
import { StoragePort } from '@/domain/disease/ports/storage.port'

export interface SubmitDiagnosisCommand {
  farmerUserId: string;
  parcelId: string;
  imageBlob: Blob;
  imageBuffer: Buffer;
  mimeType: string;
}

export class SubmitDiagnosisUseCase {
  constructor(
    private readonly diseasePort: DiseaseDetectionPort,
    private readonly storagePort: StoragePort,
    private readonly db: PrismaClient,
  ) {}

  async execute(command: SubmitDiagnosisCommand) {
    // 1. Verify farmer and parcel ownership
    const household = await this.db.household.findFirst({
      where: { keycloak_user_id: command.farmerUserId },
    })

    if (!household) {
      throw new Error('HOUSEHOLD_NOT_FOUND')
    }

    const parcel = await this.db.parcel.findUnique({
      where: { id: command.parcelId },
    })

    if (!parcel) {
      throw new Error('PARCEL_NOT_FOUND')
    }

    if (parcel.household_id !== household.id) {
      throw new Error('FORBIDDEN_PARCEL')
    }

    // 2. Upload photo to MinIO
    const uploadResult = await this.storagePort.uploadFile(
      command.imageBuffer,
      'diagnosis.jpg',
      command.mimeType
    )

    // 3. Call AI Service (Disease API)
    const aiResult = await this.diseasePort.predict(command.imageBlob)

    // 4. Save DiseaseReport to DB
    const report = await this.db.diseaseReport.create({
      data: {
        parcel_id: parcel.id,
        household_id: household.id,
        detected_by_id: command.farmerUserId,
        detection_date: new Date(),
        photo_url: uploadResult.presignedUrl,
        photo_minio_key: uploadResult.minioKey,
        ai_disease_name: aiResult.disease_name,
        ai_confidence: aiResult.confidence_score,
      },
    })

    // 5. Create Officer Notification (Broadcast)
    await this.db.notification.create({
      data: {
        type: NotificationType.DISEASE_REPORT,
        title: 'Báo cáo sâu bệnh mới',
        body: `Nông hộ ${household.name} vừa báo cáo bệnh ${aiResult.disease_name} tại thửa đất ${parcel.parcel_code}.`,
        recipient_id: null, // Broadcast to system/officers
      },
    })

    // 6. Return ONLY required fields (AI Invariant: no treatment/recommendations)
    return {
      report_id: report.id,
      disease_name: report.ai_disease_name,
      confidence_score: report.ai_confidence,
      image_url: report.photo_url,
      submitted_at: report.created_at,
    }
  }
}
