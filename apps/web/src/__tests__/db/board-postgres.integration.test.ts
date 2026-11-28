/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Runs against a throwaway Postgres with every migration applied, and only when BOARD_TEST_DATABASE_URL is set:
//   BOARD_TEST_DATABASE_URL=postgresql://... npx jest src/__tests__/db/board-postgres.integration.test.ts
// It never runs in the normal suite, which has no database.

export {}

const url = process.env.BOARD_TEST_DATABASE_URL
const maybe = url ? describe : describe.skip

maybe('director board on a real Postgres', () => {
  let prisma: import('@prisma/client').PrismaClient
  let useCase: import('@/application/board/DirectorBoardUseCase').DirectorBoardUseCase

  const run = String(Date.now())
  // 2026-11-28 10:00 in Vietnam.
  const NOW = new Date('2026-11-28T03:00:00Z')
  const at = (iso: string) => new Date(iso)
  const ids = { htx: '', other: '', hh: '', parcel: '', grade: '', grade2: '', otherHh: '', otherParcel: '', otherGrade: '' }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    ;({ prisma } = require('@/infrastructure/db/prisma.client'))
    const { DirectorBoardUseCase } = require('@/application/board/DirectorBoardUseCase')
    const { PrismaBoardSource } = require('@/infrastructure/db/board/PrismaBoardSource')
    useCase = new DirectorBoardUseCase(new PrismaBoardSource())

    const makeHtx = async (tag: string) => {
      const htx = await prisma.htxProfile.create({ data: { name: `HTX ${tag}`, address: 'x', crop_types: [], htx_code: `${tag}${run.slice(-5)}` } })
      const hh = await prisma.household.create({ data: { name: `Hộ ${tag}`, phone: `0${tag === 'A' ? 9 : 8}${run.slice(-8)}`, htx_profile_id: htx.id } })
      const parcel = await prisma.parcel.create({ data: { parcel_code: `P-${tag}-${run}`, household_id: hh.id, crop_type: 'Chè', area_ha: 1, status: 'TENDING' } })
      const grade = await prisma.leafGrade.create({ data: { htx_profile_id: htx.id, name: 'Búp 1', sort_order: 1 } })
      return { htx, hh, parcel, grade }
    }
    const a = await makeHtx('A')
    const b = await makeHtx('B')
    Object.assign(ids, { htx: a.htx.id, hh: a.hh.id, parcel: a.parcel.id, grade: a.grade.id, other: b.htx.id, otherHh: b.hh.id, otherParcel: b.parcel.id, otherGrade: b.grade.id })
    ids.grade2 = (await prisma.leafGrade.create({ data: { htx_profile_id: ids.htx, name: 'Búp 2', sort_order: 2 } })).id
    await prisma.leafGrade.create({ data: { htx_profile_id: ids.htx, name: 'Cũ', sort_order: 0, active: false } })
  })

  afterAll(async () => { await prisma.$disconnect() })

  const ticket = (htx: string, hh: string, parcel: string, grade: string, n: string, weighed: string, net: string, amount: number, status: 'VALID' | 'VOIDED' = 'VALID') =>
    prisma.freshLeafTicket.create({ data: { htx_profile_id: htx, ticket_no: `${n}-${run}`, household_id: hh, parcel_id: parcel, grade_id: grade, weighed_at: at(weighed), gross_kg: net, deduction_pct: '0', net_kg: net, price_vnd_per_kg: 9000, amount_vnd: BigInt(amount), status, created_by_id: 'u1' } })

  it('reads leaf, prices and payable of one HTX only', async () => {
    await ticket(ids.htx, ids.hh, ids.parcel, ids.grade, 't1', '2026-11-28T02:00:00Z', '10.0', 90000)
    await ticket(ids.htx, ids.hh, ids.parcel, ids.grade, 't2', '2026-11-28T01:00:00Z', '5.5', 49500)
    await ticket(ids.htx, ids.hh, ids.parcel, ids.grade, 't3', '2026-11-28T01:30:00Z', '99.0', 891000, 'VOIDED')
    await ticket(ids.htx, ids.hh, ids.parcel, ids.grade, 't4', '2026-11-27T16:59:00Z', '20.0', 180000) // 2026-11-27 23:59 VN, yesterday
    await ticket(ids.htx, ids.hh, ids.parcel, ids.grade, 't5', '2026-11-26T16:59:00Z', '7.0', 63000) // 2026-11-26 23:59 VN, before yesterday
    await ticket(ids.other, ids.otherHh, ids.otherParcel, ids.otherGrade, 'o1', '2026-11-28T02:00:00Z', '50.0', 450000)
    await prisma.dailyLeafPrice.create({ data: { htx_profile_id: ids.htx, grade_id: ids.grade, price_date: new Date('2026-11-28T00:00:00Z'), price_vnd_per_kg: 9000, published_by_id: 'u1' } })
    const item = await prisma.inputItem.create({ data: { htx_profile_id: ids.htx, name: 'Phân', unit: 'bao', unit_price_vnd: 100000, kind: 'FERTILIZER' } })
    await prisma.inputAdvance.create({ data: { htx_profile_id: ids.htx, advance_no: `VT-${run}-1`, household_id: ids.hh, item_id: item.id, quantity: 2, unit_price_vnd: 100000, amount_vnd: BigInt(200000), advanced_on: new Date('2026-11-20T00:00:00Z'), created_by_id: 'u1' } })
    await prisma.inputAdvance.create({ data: { htx_profile_id: ids.htx, advance_no: `VT-${run}-2`, household_id: ids.hh, item_id: item.id, quantity: 1, unit_price_vnd: 100000, amount_vnd: BigInt(100000), advanced_on: new Date('2026-11-20T00:00:00Z'), status: 'VOIDED', created_by_id: 'u1' } })
    const closed = await prisma.settlementPeriod.create({ data: { htx_profile_id: ids.htx, code: `A-QT-${run}`, date_from: new Date('2026-11-01T00:00:00Z'), date_to: new Date('2026-11-10T00:00:00Z'), status: 'CLOSED', created_by_id: 'u1', closed_at: new Date('2026-11-20T00:00:00Z') } })
    const hh2 = await prisma.household.create({ data: { name: 'Hộ A2', phone: `07${run.slice(-8)}`, htx_profile_id: ids.htx } })
    const hh3 = await prisma.household.create({ data: { name: 'Hộ A3', phone: `06${run.slice(-8)}`, htx_profile_id: ids.htx } })
    const line = (hid: string, payable: number, paid: boolean) => ({ period_id: closed.id, household_id: hid, leaf_net_kg: '1.0', leaf_amount_vnd: BigInt(payable), advances_vnd: BigInt(0), debt_in_vnd: BigInt(0), payable_vnd: BigInt(payable), debt_out_vnd: BigInt(0), paid_at: paid ? new Date('2026-11-21T00:00:00Z') : null })
    await prisma.memberSettlement.createMany({ data: [line(ids.hh, 400000, false), line(hh2.id, 300000, true), line(hh3.id, 0, false)] })

    const board = await useCase.read(ids.htx, NOW, 'manager')
    expect(board.today).toBe('2026-11-28')
    expect(board.leaf).toEqual({ net_kg: 15.5, amount_vnd: '139500', tickets: 2, yesterday_net_kg: 20 })
    expect(board.prices).toEqual({ published: true, grades: [{ grade_id: ids.grade, grade_name: 'Búp 1', price_vnd_per_kg: 9000 }] })
    // unpaid 400000 + unsettled valid tickets (139500 + 180000 + 63000) - valid unsettled advance 200000
    expect(board.payable).toEqual({ unpaid_lines_vnd: '400000', unsettled_leaf_vnd: '382500', unsettled_advances_vnd: '200000', total_vnd: '582500' })
    expect(board.receivables).toEqual({ outstanding_vnd: '0', overdue_count: 0, overdue_vnd: '0', top: [] })
  })

  it('sums dry stock per grade and counts old rows and open batches at their boundaries', async () => {
    const batch = (code: string, processedOn: string, status: 'OPEN' | 'FINISHED', extra: object = {}) =>
      prisma.processingBatch.create({ data: { htx_profile_id: ids.htx, batch_code: `${code}-${run}`, processed_on: new Date(`${processedOn}T00:00:00Z`), status, created_by_id: 'u1', ...extra } })
    const finished = await batch('F1', '2026-11-20', 'FINISHED', { finished_at: new Date('2026-11-21T00:00:00Z'), out_of_band: true })
    const o1 = await prisma.processingBatchOutput.create({ data: { batch_id: finished.id, grade: 'DINH', kg: '10.0' } })
    await prisma.processingBatchOutput.create({ data: { batch_id: finished.id, grade: 'CAM', kg: '2.5' } })
    const lot = await prisma.lot.create({ data: { lot_code: `L-${run}`, commodity: 'Chè', harvest_date: new Date('2026-11-20T00:00:00Z'), htx_profile_id: ids.htx } })
    await prisma.lotBatchSource.create({ data: { lot_id: lot.id, output_id: o1.id, kg: '4.0' } })
    // 60 days old (09-29) is fine, 61 days (09-28) alerts; the other grade is emptied by a lot.
    const sixty = await batch('F60', '2026-09-29', 'FINISHED')
    await prisma.processingBatchOutput.create({ data: { batch_id: sixty.id, grade: 'BOM', kg: '1.0' } })
    const sixtyOne = await batch('F61', '2026-09-28', 'FINISHED')
    await prisma.processingBatchOutput.create({ data: { batch_id: sixtyOne.id, grade: 'BOM', kg: '1.5' } })
    const emptied = await batch('F90', '2026-08-01', 'FINISHED')
    const o2 = await prisma.processingBatchOutput.create({ data: { batch_id: emptied.id, grade: 'MOC_CAU', kg: '3.0' } })
    await prisma.lotBatchSource.create({ data: { lot_id: lot.id, output_id: o2.id, kg: '3.0' } })
    await batch('O2', '2026-11-26', 'OPEN') // 2 days open
    await batch('O3', '2026-11-25', 'OPEN') // 3 days open
    await batch('OC', '2026-11-01', 'OPEN').then((b) => prisma.processingBatch.update({ where: { id: b.id }, data: { status: 'CANCELLED' } }))
    // Another HTX's batch never counts.
    const foreign = await prisma.processingBatch.create({ data: { htx_profile_id: ids.other, batch_code: `X-${run}`, processed_on: new Date('2026-01-01T00:00:00Z'), status: 'OPEN', created_by_id: 'u1' } })
    await prisma.processingBatchOutput.create({ data: { batch_id: foreign.id, grade: 'DINH', kg: '9.0' } })

    const board = await useCase.read(ids.htx, NOW, 'manager')
    expect(board.dry_stock).toEqual({
      grades: [
        { grade: 'DINH', kg: 6 },
        { grade: 'TOM_NON', kg: 0 },
        { grade: 'MOC_CAU', kg: 0 },
        { grade: 'BOM', kg: 2.5 },
        { grade: 'CAM', kg: 2.5 },
      ],
      forecast_dry_kg_14d: null,
    })
    const by = Object.fromEntries((board.alerts ?? []).map((a: { kind: string; count: number }) => [a.kind, a.count]))
    expect(by.BATCH_OUT_OF_BAND).toBe(1)
    expect(by.BATCH_OPEN_TOO_LONG).toBe(1)
    expect(by.OLD_DRY_STOCK).toBe(1) // 61 days alerts; 60 days, the fresh batch and the emptied 90-day row do not
  })

  it('counts a parcel in withdrawal, a draft period and an unpaid old line, and nothing for another HTX', async () => {
    const entry = await prisma.journalEntry.create({ data: { parcel_id: ids.parcel, entry_date: new Date('2026-11-25T00:00:00Z'), activity_type: 'SPRAYING', performed_by: 'x', submitted_role: 'FARMER', status: 'APPROVED' } })
    await prisma.journalActivity.create({ data: { journal_entry_id: entry.id, activity_detail: 'Phun', withdrawal_days: 10, safe_harvest_date: new Date('2026-12-05T00:00:00Z') } })
    await prisma.settlementPeriod.create({ data: { htx_profile_id: ids.htx, code: `A-QT-D-${run}`, date_from: new Date('2026-11-11T00:00:00Z'), date_to: new Date('2026-11-20T00:00:00Z'), status: 'DRAFT', created_by_id: 'u1' } })
    const manager = await useCase.read(ids.htx, NOW, 'manager')
    const kinds = Object.fromEntries((manager.alerts ?? []).map((a: { kind: string; count: number }) => [a.kind, a.count]))
    expect(kinds.PARCELS_IN_WITHDRAWAL).toBe(1)
    expect(kinds.SETTLEMENT_DRAFT).toBe(1)
    expect(kinds.UNPAID_LINES).toBe(1) // the 400000 line of the period closed 2026-11-20, paid and zero lines excluded
    expect(kinds.PRICE_NOT_PUBLISHED).toBeUndefined()
    const accountant = await useCase.read(ids.htx, NOW, 'accountant')
    expect((accountant.alerts ?? []).map((a: { kind: string }) => a.kind)).toEqual(['SETTLEMENT_DRAFT', 'UNPAID_LINES'])
    const other = await useCase.read(ids.other, NOW, 'manager')
    expect(other.alerts?.map((a: { kind: string }) => a.kind)).toEqual(['BATCH_OPEN_TOO_LONG', 'PRICE_NOT_PUBLISHED'])
    expect(other.leaf).toEqual({ net_kg: 50, amount_vnd: '450000', tickets: 1, yesterday_net_kg: 0 })
  })

  it('reads the whole board in under a second over 50,000 tickets', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO fresh_leaf_tickets (id, htx_profile_id, ticket_no, household_id, parcel_id, grade_id, weighed_at, gross_kg, deduction_pct, net_kg, price_vnd_per_kg, amount_vnd, created_by_id)
       SELECT 'bulk-${run}-' || g, $1, 'BULK-${run}-' || g, $2, $3, $4,
              CASE WHEN g <= 20000 THEN timestamptz '2026-11-28 08:00+07' WHEN g <= 40000 THEN timestamptz '2026-11-27 08:00+07' ELSE timestamptz '2026-10-15 08:00+07' END + (g % 600) * interval '1 second',
              10.0, 0, 10.0, 9000, 90000, 'bulk'
       FROM generate_series(1, 50000) g`,
      ids.htx, ids.hh, ids.parcel, ids.grade,
    )
    await prisma.$executeRawUnsafe('ANALYZE fresh_leaf_tickets')
    await useCase.read(ids.htx, NOW, 'manager') // warm the connection
    const started = Date.now()
    const board = await useCase.read(ids.htx, NOW, 'manager')
    const elapsed = Date.now() - started
    // eslint-disable-next-line no-console
    console.log(`board read over 50,000 tickets: ${elapsed} ms`)
    expect(board.leaf?.tickets).toBe(20002)
    expect(elapsed).toBeLessThan(1000)
  }, 180000)
})
