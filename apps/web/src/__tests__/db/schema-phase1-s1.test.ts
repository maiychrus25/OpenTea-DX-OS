// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { readFileSync } from 'fs'
import { join } from 'path'

const prismaDir = join(__dirname, '..', '..', '..', 'prisma')
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8')
const migration = readFileSync(
  join(prismaDir, 'migrations', '20261128120100_flush_and_pesticides', 'migration.sql'),
  'utf8',
)

function block(kind: 'model' | 'enum', name: string): string {
  const match = schema.match(new RegExp(`${kind} ${name} \\{[\\s\\S]*?\\n\\}`))
  if (!match) throw new Error(`${kind} ${name} missing`)
  return match[0]
}

describe('phase 1 S1 schema', () => {
  it('adds PRUNING to ActivityType', () => {
    expect(block('enum', 'ActivityType')).toContain('PRUNING')
  })

  it('declares the catalogue models', () => {
    expect(schema).toMatch(/model PesticideProduct \{/)
    expect(schema).toMatch(/model HtxPesticideLabel \{/)
    expect(block('enum', 'PesticideGroup')).toContain('ANTIBIOTIC')
  })

  it('links journal entries and lot lines to a flush', () => {
    expect(block('model', 'JournalEntry')).toContain('cycle_id')
    expect(block('model', 'LotParcel')).toContain('cycle_id')
    expect(block('model', 'JournalActivity')).toContain('pesticide_product_id')
  })

  it('makes client_id unique per sender', () => {
    expect(block('model', 'JournalEntry')).toContain('@@unique([submitted_by_id, client_id])')
  })

  it('seeds exactly 20 catalogue rows and none of the source discrepancies', () => {
    const rows = migration.match(/^\s*\('[^']+',\s*'/gm) ?? []
    expect(rows).toHaveLength(20)
    expect(migration).not.toContain('Catex 100WG')
    expect(migration).not.toContain('Antracol 700WG')
  })

  it('audits both new tables', () => {
    expect(migration).toContain('dxos_audit_row')
    expect(migration).toMatch(/public\.pesticide_products/)
    expect(migration).toMatch(/public\.htx_pesticide_labels/)
  })
})
