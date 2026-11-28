// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHash } from 'crypto'
import type { StoragePort } from '@/domain/disease/ports/storage.port'
import { ValidationError } from '@/domain/errors'

export interface ConsentedDiseaseReport {
  report_id: string
  household_id: string
  label_code: string
  htx_code: string
  confirmed_at: Date
  photo_minio_key: string
}

export interface DatasetCursor {
  confirmed_at: Date
  id: string
}

/** Confirmed, labelled reports with a photo, from cooperatives that opted in; oldest first, ties by id. `after` skips rows up to and including that position. */
export interface ConsentedDiseaseSource {
  findConsented(query: { since?: Date; htxCode?: string; after?: DatasetCursor; limit: number }): Promise<ConsentedDiseaseReport[]>
}

export interface DiseaseDatasetItem {
  report_id: string
  label_code: string
  htx_code: string
  household_key: string
  confirmed_on: string
  sha256: string
  url: string
}

const PAGE_SIZE = 500
const URL_TTL_SECONDS = 900

const encodeCursor = (row: ConsentedDiseaseReport) => Buffer.from(`${row.confirmed_at.toISOString()}|${row.report_id}`).toString('base64url')

function decodeCursor(cursor: string): DatasetCursor {
  const [at, ...rest] = Buffer.from(cursor, 'base64url').toString().split('|')
  const confirmed_at = new Date(at)
  const id = rest.join('|')
  if (!id || Number.isNaN(confirmed_at.getTime())) throw new ValidationError('Invalid cursor')
  return { confirmed_at, id }
}

/** One-way, per cooperative: the training split can keep a household together without learning who it is. */
export const householdKey = (htxCode: string, householdId: string) => createHash('sha256').update(`${htxCode}:${householdId}`).digest('hex').slice(0, 16)

/** The field-photo manifest for training, one page at a time. It carries no name, phone, position or household id; the URLs live 15 minutes. */
export class BuildDiseaseDatasetUseCase {
  constructor(private readonly source: ConsentedDiseaseSource, private readonly storage: StoragePort, private readonly pageSize = PAGE_SIZE) {}

  async execute(query: { since?: Date; htxCode?: string; cursor?: string }): Promise<{ items: DiseaseDatasetItem[]; next_cursor: string | null }> {
    const after = query.cursor ? decodeCursor(query.cursor) : undefined
    // One row more than a page tells whether another page exists.
    const fetched = await this.source.findConsented({ since: query.since, htxCode: query.htxCode, after, limit: this.pageSize + 1 })
    const rows = fetched.slice(0, this.pageSize)
    const items: DiseaseDatasetItem[] = []
    for (const row of rows) {
      try {
        const sha256 = createHash('sha256').update(await this.storage.getFileBuffer(row.photo_minio_key)).digest('hex')
        const url = await this.storage.getPresignedUrl(row.photo_minio_key, URL_TTL_SECONDS)
        items.push({ report_id: row.report_id, label_code: row.label_code, htx_code: row.htx_code, household_key: householdKey(row.htx_code, row.household_id), confirmed_on: row.confirmed_at.toISOString().slice(0, 10), sha256, url })
      } catch (err) {
        console.warn(`Disease dataset: photo of report ${row.report_id} is not readable, skipped`, err)
      }
    }
    // The cursor follows the last row read, not the last item kept, so a skipped photo never stalls the paging.
    return { items, next_cursor: fetched.length > this.pageSize ? encodeCursor(rows[rows.length - 1]) : null }
  }
}
