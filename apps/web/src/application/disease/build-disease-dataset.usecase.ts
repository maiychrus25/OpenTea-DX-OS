// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHash } from 'crypto'
import type { StoragePort } from '@/domain/disease/ports/storage.port'

export interface ConsentedDiseaseReport {
  report_id: string
  label_code: string
  htx_code: string
  confirmed_at: Date
  photo_minio_key: string
}

/** Confirmed, labelled reports with a photo, from cooperatives that opted in; oldest first. */
export interface ConsentedDiseaseSource {
  findConsented(query: { since?: Date; htxCode?: string; limit: number }): Promise<ConsentedDiseaseReport[]>
}

export interface DiseaseDatasetItem {
  report_id: string
  label_code: string
  htx_code: string
  confirmed_on: string
  sha256: string
  url: string
}

const MAX_ITEMS = 500
const URL_TTL_SECONDS = 900

/** The field-photo manifest for training. It carries no name, phone or position; the URLs live 15 minutes. */
export class BuildDiseaseDatasetUseCase {
  constructor(private readonly source: ConsentedDiseaseSource, private readonly storage: StoragePort) {}

  async execute(query: { since?: Date; htxCode?: string }): Promise<{ items: DiseaseDatasetItem[] }> {
    const rows = await this.source.findConsented({ ...query, limit: MAX_ITEMS })
    const items: DiseaseDatasetItem[] = []
    for (const row of rows) {
      try {
        const sha256 = createHash('sha256').update(await this.storage.getFileBuffer(row.photo_minio_key)).digest('hex')
        const url = await this.storage.getPresignedUrl(row.photo_minio_key, URL_TTL_SECONDS)
        items.push({ report_id: row.report_id, label_code: row.label_code, htx_code: row.htx_code, confirmed_on: row.confirmed_at.toISOString().slice(0, 10), sha256, url })
      } catch (err) {
        console.warn(`Disease dataset: photo of report ${row.report_id} is not readable, skipped`, err)
      }
    }
    return { items }
  }
}
