// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync } from 'fs'
import { join } from 'path'

const prismaDir = join(__dirname, '..', '..', '..', 'prisma')
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8')
const migration = readFileSync(join(prismaDir, 'migrations', '20261128140000_weighing_station', 'migration.sql'), 'utf8')
const auditInit = readFileSync(join(prismaDir, '..', '..', '..', 'platform', 'postgres', 'init', '03-audit-triggers.sql'), 'utf8')

function block(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))
  if (!match) throw new Error(`model ${name} missing`)
  return match[0]
}

describe('phase 1 S3 schema', () => {
  it('declares the three models with their unique keys', () => {
    expect(block('LeafGrade')).toContain('@@unique([htx_profile_id, name])')
    expect(block('DailyLeafPrice')).toContain('@@unique([grade_id, price_date])')
    expect(block('FreshLeafTicket')).toContain('ticket_no')
    expect(block('FreshLeafTicket')).toContain('@@unique([created_by_id, client_id])')
  })

  it('keeps money integral and kg to one decimal', () => {
    const ticket = block('FreshLeafTicket')
    expect(ticket).toMatch(/amount_vnd\s+BigInt/)
    expect(ticket).toMatch(/price_vnd_per_kg\s+Int/)
    expect(ticket).toMatch(/gross_kg\s+Decimal\s+@db\.Decimal\(7, 1\)/)
    expect(ticket).toMatch(/net_kg\s+Decimal\s+@db\.Decimal\(7, 1\)/)
    expect(ticket).toMatch(/deduction_pct\s+Decimal\s+@db\.Decimal\(4, 1\)/)
  })

  it('allows a ticket without a flush and leaves settlement_id without a foreign key', () => {
    const ticket = block('FreshLeafTicket')
    expect(ticket).toMatch(/cycle_id\s+String\?/)
    expect(ticket).toMatch(/settlement_id\s+String\?/)
    expect(migration).not.toMatch(/FOREIGN KEY \("settlement_id"\)/)
  })

  it('bounds the numbers in the database as well', () => {
    expect(migration).toMatch(/CHECK \("price_vnd_per_kg" BETWEEN 1 AND 10000000\)/)
    expect(migration).toMatch(/CHECK \("deduction_pct" BETWEEN 0 AND 30\)/)
    expect(migration).toMatch(/CHECK \("gross_kg" > 0 AND "gross_kg" <= 5000\)/)
  })

  it('audits every new table in the migration and in the init script', () => {
    for (const table of ['leaf_grades', 'daily_leaf_prices', 'fresh_leaf_tickets']) {
      expect(migration).toContain(`public.${table}`)
      expect(auditInit).toContain(`'${table}'`)
    }
    expect(migration).toContain('audit.capture_row()')
  })
})
