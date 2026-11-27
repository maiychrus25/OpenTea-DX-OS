// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync } from 'fs'
import { join } from 'path'

const prismaDir = join(__dirname, '..', '..', '..', 'prisma')
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8')
const migration = readFileSync(join(prismaDir, 'migrations', '20261128150000_member_ledger', 'migration.sql'), 'utf8')
const auditInit = readFileSync(join(prismaDir, '..', '..', '..', 'platform', 'postgres', 'init', '03-audit-triggers.sql'), 'utf8')

function block(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))
  if (!match) throw new Error(`model ${name} missing`)
  return match[0]
}

describe('phase 1 S4 schema', () => {
  it('declares the five models with their unique keys', () => {
    expect(block('InputItem')).toContain('@@unique([htx_profile_id, name])')
    expect(block('InputAdvance')).toContain('@@unique([created_by_id, client_id])')
    expect(block('InputAdvance')).toMatch(/advance_no\s+String\s+@unique/)
    expect(block('SettlementPeriod')).toMatch(/code\s+String\s+@unique/)
    expect(block('MemberSettlement')).toContain('@@unique([period_id, household_id])')
    expect(block('MemberLedgerEntry')).toContain('@@index([household_id, created_at])')
  })

  it('keeps money integral', () => {
    expect(block('InputAdvance')).toMatch(/amount_vnd\s+BigInt/)
    for (const field of ['leaf_amount_vnd', 'advances_vnd', 'debt_in_vnd', 'payable_vnd', 'debt_out_vnd']) {
      expect(block('MemberSettlement')).toMatch(new RegExp(`${field}\\s+BigInt`))
    }
    expect(block('MemberLedgerEntry')).toMatch(/amount_vnd\s+BigInt/)
    expect(block('InputItem')).toMatch(/unit_price_vnd\s+Int/)
    expect(block('InputAdvance')).toMatch(/quantity\s+Decimal\s+@db\.Decimal\(9, 2\)/)
  })

  it('has no carry entry types', () => {
    expect(schema).toMatch(/enum LedgerEntryType \{\s+LEAF_CREDIT\s+INPUT_DEBIT\s+PAYOUT\s+ADJUSTMENT\s+\}/)
  })

  it('links tickets, advances and ledger rows to a settlement line and never lets it be deleted', () => {
    expect(migration).toMatch(/"fresh_leaf_tickets_settlement_id_fkey" FOREIGN KEY \("settlement_id"\) REFERENCES "member_settlements"\("id"\) ON DELETE RESTRICT/)
    expect(migration).toMatch(/"input_advances_settlement_id_fkey"[^;]*ON DELETE RESTRICT/)
    expect(migration).toMatch(/"member_ledger_entries_settlement_id_fkey"[^;]*ON DELETE RESTRICT/)
  })

  it('makes the ledger append-only in the database', () => {
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON "member_ledger_entries"/)
    expect(migration).toMatch(/BEFORE TRUNCATE ON "member_ledger_entries"/)
    expect(migration).toContain('RAISE EXCEPTION')
  })

  it('stores the bank fields on the household and checks them', () => {
    for (const col of ['bank_bin', 'bank_account', 'bank_account_name']) expect(migration).toContain(`"${col}" TEXT`)
    expect(migration).toContain('"households_bank_check"')
  })

  it('audits every new table in the migration and in the init script', () => {
    for (const table of ['input_items', 'input_advances', 'settlement_periods', 'member_settlements', 'member_ledger_entries']) {
      expect(migration).toContain(`public.${table}`)
      expect(auditInit).toContain(`'${table}'`)
    }
    expect(migration).toContain('audit.capture_row()')
  })
})
