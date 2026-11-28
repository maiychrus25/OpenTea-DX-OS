/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Runs against a throwaway Postgres with every migration applied, and only when REPORT_TEST_DATABASE_URL is set:
//   REPORT_TEST_DATABASE_URL=postgresql://... npx jest src/__tests__/db/report-postgres.integration.test.ts
// It never runs in the normal suite, which has no database.

export {}

const url = process.env.REPORT_TEST_DATABASE_URL
const maybe = url ? describe : describe.skip

maybe('season report on a real Postgres', () => {
  let prisma: import('@prisma/client').PrismaClient
  let useCase: import('@/application/report/SeasonReportUseCase').SeasonReportUseCase

  const run = String(Date.now())
  const at = (iso: string) => new Date(iso)
  const day = (d: string) => new Date(`${d}T00:00:00Z`)
  const ids = { htx: '', other: '', hh: '', parcel: '', grade: '', grade2: '', otherHh: '', otherParcel: '', otherGrade: '' }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    ;({ prisma } = require('@/infrastructure/db/prisma.client'))
    const { SeasonReportUseCase } = require('@/application/report/SeasonReportUseCase')
    const { PrismaReportSource } = require('@/infrastructure/db/report/PrismaReportSource')
    useCase = new SeasonReportUseCase(new PrismaReportSource())

    const makeHtx = async (tag: string, area: number) => {
      const htx = await prisma.htxProfile.create({ data: { name: `HTX ${tag}`, address: 'x', crop_types: [], htx_code: `${tag}${run.slice(-5)}` } })
      const hh = await prisma.household.create({ data: { name: `Hộ ${tag}`, phone: `0${tag === 'A' ? 9 : 8}${run.slice(-8)}`, htx_profile_id: htx.id } })
      const parcel = await prisma.parcel.create({ data: { parcel_code: `P-${tag}-${run}`, household_id: hh.id, crop_type: 'Chè', area_ha: area, status: 'TENDING' } })
      const grade = await prisma.leafGrade.create({ data: { htx_profile_id: htx.id, name: 'Búp 1', sort_order: 1 } })
      return { htx, hh, parcel, grade }
    }
    const a = await makeHtx('A', 1.25)
    const b = await makeHtx('B', 9)
    Object.assign(ids, { htx: a.htx.id, hh: a.hh.id, parcel: a.parcel.id, grade: a.grade.id, other: b.htx.id, otherHh: b.hh.id, otherParcel: b.parcel.id, otherGrade: b.grade.id })
    ids.grade2 = (await prisma.leafGrade.create({ data: { htx_profile_id: ids.htx, name: 'Búp 2', sort_order: 2 } })).id
  })

  afterAll(async () => { await prisma.$disconnect() })

  const ticket = (htx: string, hh: string, parcel: string, grade: string, n: string, weighed: string, net: string, amount: number, status: 'VALID' | 'VOIDED' = 'VALID') =>
    prisma.freshLeafTicket.create({ data: { htx_profile_id: htx, ticket_no: `${n}-${run}`, household_id: hh, parcel_id: parcel, grade_id: grade, weighed_at: at(weighed), gross_kg: net, deduction_pct: '0', net_kg: net, price_vnd_per_kg: 9000, amount_vnd: BigInt(amount), status, created_by_id: 'u1' } })

  it('counts members as of now, one HTX only', async () => {
    await prisma.household.create({ data: { name: 'Hộ A2', phone: `07${run.slice(-8)}`, htx_profile_id: ids.htx } })
    const report = await useCase.read(ids.htx, '2026-04-01', '2026-04-30')
    expect(report.htx_name).toBe('HTX A')
    expect(report.members).toEqual({ households: 2, parcels: 1, area_ha: 1.25 })
  })

  it('sums purchases by Vietnam month and grade, with the day boundaries of the range', async () => {
    await ticket(ids.htx, ids.hh, ids.parcel, ids.grade, 'a1', '2026-03-31T16:59:59Z', '99.0', 891000) // 2026-03-31 23:59:59 VN, before
    await ticket(ids.htx, ids.hh, ids.parcel, ids.grade, 'a2', '2026-03-31T17:00:00Z', '10.0', 90000) // 2026-04-01 00:00 VN, in
    await ticket(ids.htx, ids.hh, ids.parcel, ids.grade2, 'a3', '2026-04-15T02:00:00Z', '5.5', 49500)
    await ticket(ids.htx, ids.hh, ids.parcel, ids.grade, 'a4', '2026-05-01T16:59:59Z', '2.0', 18000) // 2026-05-01 23:59 VN
    await ticket(ids.htx, ids.hh, ids.parcel, ids.grade, 'a5', '2026-05-01T17:00:00Z', '77.0', 693000) // 2026-05-02 00:00 VN, after
    await ticket(ids.htx, ids.hh, ids.parcel, ids.grade, 'a6', '2026-04-20T02:00:00Z', '50.0', 450000, 'VOIDED')
    await ticket(ids.other, ids.otherHh, ids.otherParcel, ids.otherGrade, 'o1', '2026-04-15T02:00:00Z', '40.0', 360000)
    const report = await useCase.read(ids.htx, '2026-04-01', '2026-05-01')
    expect(report.purchases).toEqual({
      total: { net_kg: 17.5, amount_vnd: '157500', tickets: 3 },
      months: [{ month: '2026-04', net_kg: 15.5, amount_vnd: '139500', tickets: 2 }, { month: '2026-05', net_kg: 2, amount_vnd: '18000', tickets: 1 }],
      by_grade: [{ grade_name: 'Búp 1', net_kg: 12, amount_vnd: '108000' }, { grade_name: 'Búp 2', net_kg: 5.5, amount_vnd: '49500' }],
    })
  })

  it('reads member money: periods closed in range, paid and open lines, valid advances in range', async () => {
    const period = (code: string, status: 'DRAFT' | 'CLOSED', closed: string | null) =>
      prisma.settlementPeriod.create({ data: { htx_profile_id: ids.htx, code: `${code}-${run}`, date_from: day('2026-03-01'), date_to: day('2026-03-10'), status, created_by_id: 'u1', closed_at: closed ? at(closed) : null } })
    const inRange = await period('R1', 'CLOSED', '2026-04-10T00:00:00Z')
    const before = await period('R2', 'CLOSED', '2026-03-31T16:59:59Z')
    const draft = await period('R3', 'DRAFT', null)
    const hh2 = await prisma.household.create({ data: { name: 'Hộ A3', phone: `06${run.slice(-8)}`, htx_profile_id: ids.htx } })
    const line = (periodId: string, hid: string, payable: number, paid: boolean) => ({ period_id: periodId, household_id: hid, leaf_net_kg: '1.0', leaf_amount_vnd: BigInt(payable), advances_vnd: BigInt(0), debt_in_vnd: BigInt(0), payable_vnd: BigInt(payable), debt_out_vnd: BigInt(0), paid_at: paid ? at('2026-04-11T00:00:00Z') : null })
    await prisma.memberSettlement.createMany({ data: [line(inRange.id, ids.hh, 400000, true), line(inRange.id, hh2.id, 250000, false), line(before.id, ids.hh, 999, false), line(draft.id, ids.hh, 888, false)] })
    const item = await prisma.inputItem.create({ data: { htx_profile_id: ids.htx, name: 'Phân', unit: 'bao', unit_price_vnd: 100000, kind: 'FERTILIZER' } })
    const advance = (n: string, on: string, amount: number, status: 'VALID' | 'VOIDED' = 'VALID') =>
      prisma.inputAdvance.create({ data: { htx_profile_id: ids.htx, advance_no: `VT-${run}-${n}`, household_id: ids.hh, item_id: item.id, quantity: 1, unit_price_vnd: amount, amount_vnd: BigInt(amount), advanced_on: day(on), status, created_by_id: 'u1' } })
    await advance('1', '2026-04-01', 200000)
    await advance('2', '2026-04-30', 50000)
    await advance('3', '2026-05-01', 7000)
    await advance('4', '2026-03-31', 7000)
    await advance('5', '2026-04-10', 100000, 'VOIDED')
    const report = await useCase.read(ids.htx, '2026-04-01', '2026-04-30')
    expect(report.member_money).toEqual({ periods_closed: 1, paid_vnd: '400000', payable_open_vnd: '250000', advances_vnd: '250000' })
  })

  it('reads processing by finished_at and lots with certificates valid on the last day', async () => {
    const batch = (code: string, finished: string | null, status: 'FINISHED' | 'OPEN' | 'CANCELLED', extra: object = {}) =>
      prisma.processingBatch.create({ data: { htx_profile_id: ids.htx, batch_code: `${code}-${run}`, processed_on: day('2026-04-01'), status, created_by_id: 'u1', finished_at: finished ? at(finished) : null, ...extra } })
    const f1 = await batch('P1', '2026-04-10T00:00:00Z', 'FINISHED', { fresh_kg: '100.0', dry_kg: '22.0', out_of_band: true })
    await prisma.processingBatchOutput.createMany({ data: [{ batch_id: f1.id, grade: 'DINH', kg: '20.0' }, { batch_id: f1.id, grade: 'CAM', kg: '2.0' }] })
    const f2 = await batch('P2', '2026-04-20T00:00:00Z', 'FINISHED', { fresh_kg: '50.0', dry_kg: '10.0' })
    const o2 = await prisma.processingBatchOutput.create({ data: { batch_id: f2.id, grade: 'DINH', kg: '10.0' } })
    const out = await batch('P3', '2026-05-01T17:00:00Z', 'FINISHED', { fresh_kg: '999.0', dry_kg: '999.0' }) // 2026-05-02 VN
    await prisma.processingBatchOutput.create({ data: { batch_id: out.id, grade: 'BOM', kg: '999.0' } })
    await batch('P4', null, 'OPEN', { fresh_kg: '5.0' })

    const lot = (code: string, created: string, status: 'READY' | 'QR_EXPORTED', extra: object = {}) =>
      prisma.lot.create({ data: { lot_code: `${code}-${run}`, commodity: 'Chè', harvest_date: day('2026-04-01'), htx_profile_id: ids.htx, status, created_at: at(created), ...extra } })
    const l1 = await lot('LA', '2026-04-12T00:00:00Z', 'QR_EXPORTED')
    await prisma.lotBatchSource.create({ data: { lot_id: l1.id, output_id: o2.id, kg: '6.5' } })
    await lot('LB', '2026-04-13T00:00:00Z', 'READY', { total_weight_kg: 12 }) // legacy lot, weight typed on it
    await lot('LC', '2026-05-01T17:00:00Z', 'READY', { total_weight_kg: 500 }) // outside
    await lot('LD', '2026-04-14T00:00:00Z', 'QR_EXPORTED').then(() => undefined)

    const cert = (n: string, issued: string, expires: string, revoked: Date | null = null, kind: 'VIETGAP' | 'OCOP' = 'VIETGAP') =>
      prisma.htxCertificate.create({ data: { htx_profile_id: ids.htx, kind, number: `${n}-${run}`, issuer: 'Sở', issued_on: day(issued), expires_on: day(expires), file_key: 'k', file_name: 'f.pdf', file_mime: 'application/pdf', file_size: 1, created_by_id: 'u1', revoked_at: revoked } })
    await cert('C-OK', '2025-01-01', '2026-04-30') // expires on the last day: valid
    await cert('C-EXP', '2025-01-01', '2026-04-29')
    await cert('C-REV', '2025-01-01', '2027-01-01', at('2026-02-01T00:00:00Z'))
    await cert('C-FUT', '2026-05-01', '2028-01-01')
    await prisma.htxCertificate.create({ data: { htx_profile_id: ids.other, kind: 'OCOP', number: `C-OTHER-${run}`, issuer: 'x', issued_on: day('2025-01-01'), expires_on: day('2027-01-01'), file_key: 'k', file_name: 'f.pdf', file_mime: 'application/pdf', file_size: 1, created_by_id: 'u1' } })

    const report = await useCase.read(ids.htx, '2026-04-01', '2026-04-30')
    expect(report.processing).toEqual({
      batches: 2, fresh_kg: 150, dry_kg: 32, avg_ratio: 4.69, out_of_band: 1,
      by_grade: [{ grade: 'DINH', kg: 30 }, { grade: 'TOM_NON', kg: 0 }, { grade: 'MOC_CAU', kg: 0 }, { grade: 'BOM', kg: 0 }, { grade: 'CAM', kg: 2 }],
    })
    expect(report.lots).toEqual({ lots: 3, exported: 2, kg: 18.5, certificates_valid: [{ kind: 'VIETGAP', number: `C-OK-${run}`, issuer: 'Sở', expires_on: '2026-04-30' }] })
  })

  it('counts approved sprayings and harvested cycles in the range of one HTX', async () => {
    const entry = (parcel: string, date: string, type: 'SPRAYING' | 'FERTILIZING', status: string) =>
      prisma.journalEntry.create({ data: { parcel_id: parcel, entry_date: at(date), activity_type: type, performed_by: 'x', submitted_role: 'OFFICER', status } })
    await entry(ids.parcel, '2026-04-10T00:00:00Z', 'SPRAYING', 'APPROVED')
    await entry(ids.parcel, '2026-04-11T00:00:00Z', 'SPRAYING', 'PENDING_APPROVAL')
    await entry(ids.parcel, '2026-04-12T00:00:00Z', 'FERTILIZING', 'APPROVED')
    await entry(ids.parcel, '2026-05-01T17:00:00Z', 'SPRAYING', 'APPROVED') // outside
    await entry(ids.otherParcel, '2026-04-10T00:00:00Z', 'SPRAYING', 'APPROVED')
    await prisma.parcelCropCycle.create({ data: { parcel_id: ids.parcel, harvested_at: at('2026-04-20T00:00:00Z') } })
    await prisma.parcelCropCycle.create({ data: { parcel_id: ids.parcel, harvested_at: at('2026-03-20T00:00:00Z') } })
    await prisma.parcelCropCycle.create({ data: { parcel_id: ids.otherParcel, harvested_at: at('2026-04-20T00:00:00Z') } })
    const report = await useCase.read(ids.htx, '2026-04-01', '2026-04-30')
    expect(report.safety).toEqual({ sprayings_approved: 1, harvests_approved: 1 })
  })
})
