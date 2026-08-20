// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { DiseaseDetectionPort } from '@/domain/disease/ports/disease-detection.port'
import { StoragePort } from '@/domain/disease/ports/storage.port'
import { ParcelPort } from '@/domain/farm/ports/ParcelPort'
import { DiseaseReportPort } from '@/domain/disease/ports/disease-report.port'
import { NotificationPort } from '@/domain/ports/notification-port'

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
    private readonly parcelPort: ParcelPort,
    private readonly diseaseReportPort: DiseaseReportPort,
    private readonly notificationPort: NotificationPort
  ) {}

  async execute(command: SubmitDiagnosisCommand) {
    // 1. Verify farmer and parcel ownership
    const parcel = await this.parcelPort.findById(command.parcelId)

    if (!parcel) {
      throw new Error('PARCEL_NOT_FOUND')
    }

    if (!parcel.household || parcel.household.keycloak_user_id !== command.farmerUserId) {
      if (!parcel.household) throw new Error('HOUSEHOLD_NOT_FOUND')
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
    const report = await this.diseaseReportPort.save({
      parcel_id: command.parcelId,
      household_id: parcel.household_id,
      detected_by_id: command.farmerUserId,
      detection_date: new Date(),
      photo_url: uploadResult.presignedUrl,
      photo_minio_key: uploadResult.minioKey,
      ai_disease_name: aiResult.disease_name,
      ai_confidence: aiResult.confidence_score,
    })

    // 5. Create Officer Notification (Broadcast)
    await this.notificationPort.broadcastDiseaseReport(
      parcel.household.name,
      aiResult.disease_name,
      parcel.parcel_code
    )

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
