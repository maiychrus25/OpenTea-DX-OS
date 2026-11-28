// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync } from 'fs'
import { join } from 'path'

const prismaDir = join(__dirname, '..', '..', '..', 'prisma')
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8')
const migration = readFileSync(join(prismaDir, 'migrations', '20261128170000_sales', 'migration.sql'), 'utf8')
const auditInit = readFileSync(join(prismaDir, '..', '..', '..', 'platform', 'postgres', 'init', '03-audit-triggers.sql'), 'utf8')

function block(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))
  if (!match) throw new Error(`model ${name} missing`)
  return match[0]
}

describe('phase 3 S8 schema', () => {
  it('keeps one core order per external reference and integral money', () => {
    expect(block('SalesOrder')).toContain('@@unique([htx_profile_id, source, external_ref])')
    expect(block('SalesOrder')).toMatch(/order_no\s+String\s+@unique/)
    expect(block('SalesOrder')).toMatch(/total_vnd\s+BigInt/)
    expect(block('SalesOrderLine')).toMatch(/net_g\s+Int/)
    expect(block('SalesOrderLine')).toMatch(/amount_vnd\s+BigInt/)
    expect(block('SalesPayment')).toMatch(/amount_vnd\s+BigInt/)
    expect(block('SalesPayment')).toMatch(/method\s+PaymentMethod/)
  })

  it('declares the enums', () => {
    expect(schema).toMatch(/enum SalesKind \{\s+WHOLESALE\s+RETAIL\s+\}/)
    expect(schema).toMatch(/enum SalesSource \{\s+CORE\s+TEA_SHOP\s+\}/)
    expect(schema).toMatch(/enum SalesStatus \{\s+CONFIRMED\s+CANCELLED\s+\}/)
  })

  it('refuses in the database what the app refuses', () => {
    for (const rule of ['"net_g" > 0', '"pack_count" * "pack_net_g"', '"amount_vnd" >= 0', '"total_vnd" >= 0', '"amount_vnd" > 0', '"due_on" >= "ordered_on"']) {
      expect(migration).toContain(rule)
    }
  })

  it('keeps payments append-only and audits all three tables', () => {
    expect(migration).toMatch(/sales_payments_append_only BEFORE UPDATE OR DELETE ON "sales_payments"/)
    expect(migration).toMatch(/sales_payments_no_truncate BEFORE TRUNCATE ON "sales_payments"/)
    for (const table of ['sales_orders', 'sales_order_lines', 'sales_payments']) {
      expect(migration).toContain(`public.${table}`)
      expect(auditInit).toContain(`'${table}'`)
    }
  })
})
