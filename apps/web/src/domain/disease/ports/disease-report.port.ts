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
  findPendingReports(): Promise<OfficerPendingReportItem[]>;
  findById(id: string): Promise<DiseaseReportDetails | null>;
  /** `confirmedDiagnosis` is the officer's disease name; null when the report is rejected. */
  updateStatus(id: string, status: string, treatment: string, officerId: string, confirmedDiagnosis: string | null): Promise<void>;
}

export interface OfficerPendingReportItem {
  id: string;
  detection_date: Date;
  photo_minio_key: string;
  ai_disease_name: string;
  ai_confidence: number;
  confirmed_diagnosis: string | null;
  farmer_name: string;
  parcel_code: string;
  photo_url?: string;
}

export interface DiseaseReportDetails {
  id: string;
  detection_date: Date;
  photo_minio_key: string;
  ai_disease_name: string;
  ai_confidence: number;
  confirmed_diagnosis: string | null;
  status: string;
  treatment_recommendation?: string | null;
  farmer_id: string;
  farmer_name: string;
  parcel_code: string;
}

export interface DiagnosisHistoryItem {
  id: string;
  detection_date: Date;
  photo_minio_key: string;
  ai_disease_name: string;
  ai_confidence: number;
  confirmed_diagnosis: string | null;
  status: string;
  parcel_code: string;
  photo_url?: string;
  treatment_recommendation?: string | null;
}
