// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '../../..')
const sql = readFileSync(join(root, 'prisma/migrations/20261128160000_processing_batches/migration.sql'), 'utf8')
const audit = readFileSync(join(root, '../../platform/postgres/init/03-audit-triggers.sql'), 'utf8')

describe('processing batches migration', () => {
  it.each(['processing_batches', 'processing_batch_outputs', 'lot_batch_sources'])('creates %s', (table) => {
    expect(sql).toContain(`CREATE TABLE "${table}"`)
  })

  it('adds the ticket link with RESTRICT and the lot grade', () => {
    expect(sql).toMatch(/ALTER TABLE "fresh_leaf_tickets" ADD COLUMN\s+"processing_batch_id"/)
    expect(sql).toMatch(/fresh_leaf_tickets_processing_batch_id_fkey[^;]+ON DELETE RESTRICT/)
    expect(sql).toMatch(/ALTER TABLE "lots" ADD COLUMN\s+"dry_grade"/)
  })

  it('creates the enums with the shared grade values', () => {
    expect(sql).toContain(`CREATE TYPE "DryTeaGrade" AS ENUM ('DINH', 'TOM_NON', 'MOC_CAU', 'BOM', 'CAM')`)
    expect(sql).toContain(`CREATE TYPE "ProcessingBatchStatus" AS ENUM ('OPEN', 'FINISHED', 'CANCELLED')`)
  })

  it('refuses bad numbers in the database', () => {
    expect(sql).toMatch(/processing_batch_outputs_kg_check[^;]+"kg" > 0/)
    expect(sql).toMatch(/lot_batch_sources_kg_check[^;]+"kg" > 0/)
    expect(sql).toMatch(/processing_batches_totals_check/)
  })

  it('attaches row audit in a guarded block and in the init script', () => {
    expect(sql).toContain("IF to_regprocedure('audit.capture_row()') IS NOT NULL")
    for (const t of ['processing_batches', 'processing_batch_outputs', 'lot_batch_sources']) {
      expect(sql).toContain(`ON public.${t}`)
      expect(audit).toContain(`'${t}'`)
    }
  })
})
