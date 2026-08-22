// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { DiseaseReportPort } from '@/domain/disease/ports/disease-report.port'
import { StoragePort } from '@/domain/disease/ports/storage.port'

export interface GetParcelPhotoResponse {
  photoUrl: string | null
  date: Date | null
}

export class GetParcelPhotoUseCase {
  constructor(
    private diseaseReportRepo: DiseaseReportPort,
    private storageRepo: StoragePort
  ) {}

  async execute(parcelId: string): Promise<GetParcelPhotoResponse> {
    const report = await this.diseaseReportRepo.findLatestByParcelId(parcelId)
    
    if (!report || !report.photo_minio_key) {
      return { photoUrl: null, date: null }
    }

    const url = await this.storageRepo.getPresignedUrl(report.photo_minio_key, 3600)
    
    return {
      photoUrl: url,
      date: report.detection_date
    }
  }
}
