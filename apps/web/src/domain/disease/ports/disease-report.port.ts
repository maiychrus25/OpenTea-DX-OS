// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface DiseaseReportData {
  parcel_id: string;
  household_id: string;
  detected_by_id: string;
  detection_date: Date;
  photo_url: string;
  photo_minio_key: string;
  ai_disease_name: string;
  ai_confidence: number;
}

export interface DiseaseReportPort {
  save(data: DiseaseReportData): Promise<{
    id: string;
    ai_disease_name: string;
    ai_confidence: number;
    photo_url: string;
    created_at: Date;
  }>;
  findLatestByParcelId(parcelId: string): Promise<{ photo_minio_key: string; detection_date: Date } | null>;
  findHistoryByFarmer(farmerId: string): Promise<DiagnosisHistoryItem[]>;
}

export interface DiagnosisHistoryItem {
  id: string;
  detection_date: Date;
  photo_minio_key: string;
  ai_disease_name: string;
  ai_confidence: number;
  status: string;
  parcel_code: string;
  photo_url?: string;
}
