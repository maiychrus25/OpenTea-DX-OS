// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { SeasonReportUseCase } from '@/application/report/SeasonReportUseCase'
import { reportSectionCsv } from '@/application/report/reportCsv'
import { reportCsvQuerySchema } from '@/lib/validations/report.schema'
import type { ReportSource } from '@/domain/report/ports/ReportSource'

jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))

const B = BigInt

function source(over: Partial<ReportSource> = {}): ReportSource {
  return {
    htxName: jest.fn(async () => 'HTX Tân Cương'),
    members: jest.fn(async () => ({ households: 12, parcels: 20, area_ha: 7.5 })),
    purchases: jest.fn(async () => ({
      months: [{ month: '2026-04', net_kg: 100.5, amount_vnd: B(900000), tickets: 4 }, { month: '2026-05', net_kg: 50, amount_vnd: B(450000), tickets: 2 }],
      by_grade: [{ grade_name: 'Búp 1', net_kg: 150.5, amount_vnd: B(1350000) }],
    })),
    memberMoney: jest.fn(async () => ({ periods_closed: 2, paid_vnd: B(800000), payable_open_vnd: B(250000), advances_vnd: B(100000) })),
    processing: jest.fn(async () => ({ batches: 3, fresh_kg: 100, dry_kg: 22, out_of_band: 1, by_grade: [{ grade: 'DINH' as const, kg: 20 }, { grade: 'CAM' as const, kg: 2 }] })),
    lots: jest.fn(async () => ({ lots: 2, exported: 1, kg: 18.5, certificates_valid: [{ kind: 'VIETGAP' as const, number: 'VG-1', issuer: 'Sở NN', expires_on: '2027-01-01' }] })),
    sales: jest.fn(async () => ({ wholesale_vnd: B(5000000), retail_vnd: B(700000), kg_sold: 12.34, receivable_vnd: B(1200000), top_partners: [{ partner_name: 'Anh Ba', amount_vnd: B(3000000) }] })),
    safety: jest.fn(async () => ({ sprayings_approved: 5, harvests_approved: 9 })),
    ...over,
  }
}

const read = (s: ReportSource, from = '2026-01-01', to = '2026-12-31') => new SeasonReportUseCase(s).read('htx-1', from, to)

describe('SeasonReportUseCase', () => {
  it('builds every section but sales, with money as strings', async () => {
    const s = source()
    const report = await read(s)
    expect(report).toMatchObject({ htx_name: 'HTX Tân Cương', from: '2026-01-01', to: '2026-12-31' })
    expect(report.sales).toEqual({ wholesale_vnd: '5000000', retail_vnd: '700000', kg_sold: 12.3, receivable_vnd: '1200000', top_partners: [{ partner_name: 'Anh Ba', amount_vnd: '3000000' }] })
    expect(report.members).toEqual({ households: 12, parcels: 20, area_ha: 7.5 })
    expect(report.purchases?.total).toEqual({ net_kg: 150.5, amount_vnd: '1350000', tickets: 6 })
    expect(report.purchases?.months[1]).toEqual({ month: '2026-05', net_kg: 50, amount_vnd: '450000', tickets: 2 })
    expect(report.purchases?.by_grade).toEqual([{ grade_name: 'Búp 1', net_kg: 150.5, amount_vnd: '1350000' }])
    expect(report.member_money).toEqual({ periods_closed: 2, paid_vnd: '800000', payable_open_vnd: '250000', advances_vnd: '100000' })
    expect(report.processing).toMatchObject({ batches: 3, fresh_kg: 100, dry_kg: 22, avg_ratio: 4.55, out_of_band: 1 })
    expect(report.lots?.certificates_valid).toHaveLength(1)
    expect(report.safety).toEqual({ sprayings_approved: 5, harvests_approved: 9 })
    expect(s.purchases).toHaveBeenCalledWith('htx-1', { from: '2026-01-01', to: '2026-12-31', start: new Date('2025-12-31T17:00:00Z'), end: new Date('2026-12-31T17:00:00Z') })
    expect(Number.isNaN(Date.parse(report.generated_at))).toBe(false)
  })

  it('has no average ratio without dry kg', async () => {
    const report = await read(source({ processing: async () => ({ batches: 1, fresh_kg: 10, dry_kg: 0, out_of_band: 0, by_grade: [] }) }))
    expect(report.processing?.avg_ratio).toBeNull()
  })

  it('turns a failing section into null and keeps the rest', async () => {
    const report = await read(source({ purchases: async () => { throw new Error('db down') }, htxName: async () => { throw new Error('x') } }))
    expect(report.purchases).toBeNull()
    expect(report.members).not.toBeNull()
    expect(report.htx_name).toBe('')
  })
})

describe('reportSectionCsv', () => {
  it('writes one Vietnamese table per section and neutralises formulas', async () => {
    const report = await read(source({ lots: async () => ({ lots: 1, exported: 0, kg: 1, certificates_valid: [{ kind: 'OCOP' as const, number: '=1+1', issuer: 'a', expires_on: '2027-01-01' }] }) }))
    expect(reportSectionCsv(report, 'purchases')).toContain('"Tháng","Kg tịnh","Thành tiền (đ)","Số phiếu"\r\n"2026-04","100.5","900000","4"')
    expect(reportSectionCsv(report, 'lots')).toContain(`"'=1+1"`)
    expect(reportSectionCsv(report, 'members')).toContain('"12"')
    expect(reportSectionCsv(report, 'sales')).toContain('"Phải thu cuối kỳ (đ)","1200000"')
    for (const section of ['member_money', 'processing', 'safety'] as const) expect(reportSectionCsv(report, section)).toMatch(/^"/)
  })

  it('refuses a section that did not load', async () => {
    const report = await read(source({ sales: async () => { throw new Error('x') } }))
    expect(report.sales).toBeNull()
    expect(reportSectionCsv(report, 'sales')).toBeNull()
  })
})

describe('reportCsvQuerySchema', () => {
  const ok = { from: '2026-01-01', to: '2026-12-31', section: 'lots' }
  it('accepts a year and rejects bad input', () => {
    expect(reportCsvQuerySchema.safeParse(ok).success).toBe(true)
    expect(reportCsvQuerySchema.safeParse({ ...ok, section: 'x' }).success).toBe(false)
    expect(reportCsvQuerySchema.safeParse({ ...ok, from: '2027-01-01' }).success).toBe(false)
    expect(reportCsvQuerySchema.safeParse({ ...ok, to: '2029-12-31' }).success).toBe(false)
    expect(reportCsvQuerySchema.safeParse({ ...ok, to: '2026-02-31' }).success).toBe(false)
  })
})
