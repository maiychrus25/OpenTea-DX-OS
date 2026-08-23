// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotTraceData } from '@/domain/entities/lot-trace-data'

export interface LotSummary {
  id: string
  lot_code: string
  commodity: string
  harvest_date: Date
  estimated_weight_kg: number | null
  actual_weight_kg: number | null
  status: string
  parcel_count: number
  created_at: Date
}

export interface CreateLotData {
  commodity: string
  harvest_date: Date
  estimated_weight_kg?: number
  parcel_ids: string[]
  packaging_type?: string
  destination?: string
  buyer_name?: string
  htx_profile_id: string
  created_by_id: string
}

export interface LotFilters {
  status?: string
  page?: number
  limit?: number
}

export interface ExportQrResult {
  lot_code: string
  qr_image_url: string
  public_page_url: string
}

export interface LotPort {
  findAll(filters: LotFilters): Promise<LotSummary[]>
  findById(id: string): Promise<LotSummary | null>
  create(data: CreateLotData): Promise<LotSummary>
  exportQr(id: string, snapshotData: LotTraceData, qrImageUrl?: string, certificateKeys?: string[]): Promise<ExportQrResult>
}
