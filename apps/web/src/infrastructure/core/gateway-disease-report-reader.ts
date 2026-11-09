// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type {
  DiagnosisHistoryItem,
  DiseaseReportPort,
  OfficerPendingReportItem,
} from '@/domain/disease/ports/disease-report.port'
import { CoreGatewayClient, parseCoreTimestamp } from './core-gateway.client'

interface ReportRowBase {
  id: string
  detection_date: string
  photo_minio_key: string
  ai_disease_name: string
  ai_confidence: number
  parcel: { parcel_code: string } | null
}

interface PendingRow extends ReportRowBase {
  photo_url: string
  household: { name: string } | null
}

interface HistoryRow extends ReportRowBase {
  status: string
  treatment_recommendation: string | null
}

// The port types farmer_name and parcel_code as string, so a relation Hasura hides becomes ''.
function toPendingReport(row: PendingRow): OfficerPendingReportItem {
  return {
    id: row.id,
    detection_date: parseCoreTimestamp(row.detection_date),
    photo_minio_key: row.photo_minio_key,
    ai_disease_name: row.ai_disease_name,
    ai_confidence: row.ai_confidence,
    farmer_name: row.household?.name ?? '',
    parcel_code: row.parcel?.parcel_code ?? '',
    photo_url: row.photo_url,
  }
}

function toHistoryItem(row: HistoryRow): DiagnosisHistoryItem {
  return {
    id: row.id,
    detection_date: parseCoreTimestamp(row.detection_date),
    photo_minio_key: row.photo_minio_key,
    ai_disease_name: row.ai_disease_name,
    ai_confidence: row.ai_confidence,
    status: row.status,
    parcel_code: row.parcel?.parcel_code ?? '',
    treatment_recommendation: row.treatment_recommendation,
  }
}

export class GatewayDiseaseReportReader implements Pick<DiseaseReportPort, 'findPendingReports' | 'findHistoryByFarmer'> {
  constructor(private readonly client: CoreGatewayClient) {}

  async findPendingReports(): Promise<OfficerPendingReportItem[]> {
    const data = await this.client.graphql<{ disease_reports: PendingRow[] }>(
      `query {
        disease_reports(where: { status: { _eq: "PENDING" } }, order_by: { detection_date: asc }) {
          id detection_date photo_minio_key ai_disease_name ai_confidence photo_url
          parcel { parcel_code }
          household { name }
        }
      }`
    )
    return data.disease_reports.map(toPendingReport)
  }

  async findHistoryByFarmer(farmerId: string): Promise<DiagnosisHistoryItem[]> {
    const data = await this.client.graphql<{ disease_reports: HistoryRow[] }>(
      `query ($farmerId: String!) {
        disease_reports(where: { detected_by_id: { _eq: $farmerId } }, order_by: { detection_date: desc }) {
          id detection_date photo_minio_key ai_disease_name ai_confidence status treatment_recommendation
          parcel { parcel_code }
        }
      }`,
      { farmerId }
    )
    return data.disease_reports.map(toHistoryItem)
  }
}
