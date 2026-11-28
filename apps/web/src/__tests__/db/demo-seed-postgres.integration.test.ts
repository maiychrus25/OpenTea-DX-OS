/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Runs against a throwaway Postgres with every migration applied and `npm run seed` done, only when DEMO_TEST_DATABASE_URL is set:
//   DEMO_TEST_DATABASE_URL=postgresql://... npx jest src/__tests__/db/demo-seed-postgres.integration.test.ts
// It never runs in the normal suite, which has no database. The database is left with the demo data.

export {}

const url = process.env.DEMO_TEST_DATABASE_URL
const maybe = url ? describe : describe.skip

maybe('demo-seed on a real Postgres', () => {
  let prisma: import('@prisma/client').PrismaClient
  const uploads: string[] = []
  const storage = { uploadDocument: async (key: string) => { uploads.push(key) } }
  let first: string[] = []
  let second: string[] = []

  const counts = async () => ({
    tickets: await prisma.freshLeafTicket.count(),
    batches: await prisma.processingBatch.count(),
    advances: await prisma.inputAdvance.count(),
    periods: await prisma.settlementPeriod.count(),
    ledger: await prisma.memberLedgerEntry.count(),
    certificates: await prisma.htxCertificate.count(),
    prices: await prisma.dailyLeafPrice.count(),
  })

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    ;({ prisma } = require('@/infrastructure/db/prisma.client'))
    const { runDemoSeed } = require('../../../prisma/demo-seed')
    first = (await runDemoSeed({ storage })).lines
    before = await counts()
    second = (await runDemoSeed({ storage })).lines
  })
  let before: Awaited<ReturnType<typeof counts>>

  afterAll(async () => { await prisma.$disconnect() })

  it('adds nothing on the second run', async () => {
    expect(await counts()).toEqual(before)
    expect(uploads).toHaveLength(1)
    expect(second.join('\n')).toContain('đã có, giữ nguyên')
    expect(first.length).toBeGreaterThan(5)
  })

  it('prices today and leaves TC-A3 under an active withdrawal', async () => {
    const { vnDayOf } = require('@/application/agent/campaign/vn-day')
    expect(await prisma.dailyLeafPrice.count({ where: { price_date: new Date(`${vnDayOf(new Date())}T00:00:00Z`) } })).toBe(3)
    const spray = await prisma.journalEntry.findFirstOrThrow({ where: { parcel: { parcel_code: 'TC-A3' }, activity_type: 'SPRAYING' }, orderBy: { entry_date: 'desc' }, include: { activities: true } })
    expect(spray.activities[0].safe_harvest_date!.getTime()).toBeGreaterThan(Date.now())
    expect(await prisma.freshLeafTicket.count({ where: { parcel: { parcel_code: { in: ['TC-A1', 'TC-A2', 'TC-B1', 'TC-B2'] } }, client_id: { startsWith: 'demo-' } } })).toBe(12)
  })

  it('has a finished batch in the recovery band and a lot with four layers', async () => {
    const batch = await prisma.processingBatch.findFirstOrThrow({ where: { notes: { contains: 'demo-seed' } }, include: { outputs: true, tickets: true } })
    expect(batch.status).toBe('FINISHED')
    expect(Number(batch.recovery_ratio)).toBe(4.75)
    expect(Number(batch.recovery_ratio)).toBeGreaterThanOrEqual(4.5)
    expect(Number(batch.recovery_ratio)).toBeLessThanOrEqual(5)
    expect(batch.out_of_band).toBe(false)
    expect(batch.tickets).toHaveLength(3)
    expect(batch.outputs.map((o) => o.grade).sort()).toEqual(['DINH', 'TOM_NON'])

    const { PrismaLotTraceRepository } = require('@/infrastructure/db/repositories/prisma-lot-trace-repository')
    const trace = await new PrismaLotTraceRepository().getLotByCode('TC-CHE-A3-001')
    expect(trace.parcels).toHaveLength(1)
    expect(trace.journal_summaries.some((j: { withdrawal_days: number | null }) => j.withdrawal_days === 7)).toBe(true)
    expect(trace.batches).toHaveLength(1)
    expect(trace.batches[0].batch_code).toBe(batch.batch_code)
    expect(trace.intake).toHaveLength(3)
    expect(trace.certificates).toHaveLength(1)
    expect(trace.certificates[0]).toMatchObject({ kind: 'VIETGAP', revoked_at: null })
    expect(uploads[0]).toBe(trace.certificates[0].file_key)

    const React = require('react')
    const { renderToStaticMarkup } = require('react-dom/server')
    const { PublicTrace } = require('@/components/features/qr/PublicTrace')
    const html = renderToStaticMarkup(React.createElement(PublicTrace, { trace, verification: [], certificateState: () => 'VALID' }))
    for (const heading of ['1. Vùng trồng', '2. An toàn cách ly', '3. Mẻ sao chế biến', '4. Chứng nhận']) expect(html).toContain(heading)
  })

  it('closed one period with a payable line that has a VietQR bank account and an advance offset', async () => {
    const period = await prisma.settlementPeriod.findFirstOrThrow({ include: { lines: { include: { household: true, advances: true } } } })
    expect(period.status).toBe('CLOSED')
    const line = period.lines.find((l) => l.household.name === 'Hoàng Văn Tâm')!
    expect(line.advances).toHaveLength(1)
    expect(line.advances_vnd).toBe(BigInt(900000))
    expect(line.payable_vnd > BigInt(0)).toBe(true)
    expect(line.household).toMatchObject({ bank_bin: '970436', bank_account_name: expect.stringContaining('DEMO') })
    const { payload } = require('@/domain/payment/vietqr')
    expect(payload(line.household.bank_bin!, line.household.bank_account!, line.payable_vnd, 'DEMO')).toMatch(/^000201/)
    expect(await prisma.memberLedgerEntry.count({ where: { settlement_id: line.id } })).toBe(2)
  })

  it('holds the A13 inputs: a pesticide advance with no spraying and tickets over the norm', async () => {
    const advance = await prisma.inputAdvance.findFirstOrThrow({ where: { client_id: 'demo-adv-pesticide' }, include: { item: true, household: { include: { parcels: true } } } })
    expect(advance.status).toBe('VALID')
    expect(advance.item.kind).toBe('PESTICIDE')
    const age = (Date.now() - advance.advanced_on.getTime()) / 86_400_000
    expect(age).toBeGreaterThanOrEqual(11)
    expect(age).toBeLessThanOrEqual(60)
    expect(advance.household.name).toBe('Đỗ Thị Hạnh')
    expect(await prisma.journalEntry.count({ where: { activity_type: 'SPRAYING', parcel_id: { in: advance.household.parcels.map((p) => p.id) } } })).toBe(0)

    const b2 = await prisma.parcel.findUniqueOrThrow({ where: { parcel_code: 'TC-B2' } })
    const sum = await prisma.freshLeafTicket.aggregate({ _sum: { net_kg: true }, where: { parcel_id: b2.id, status: 'VALID' } })
    expect(Number(sum._sum.net_kg)).toBeGreaterThan(b2.area_ha * 1800 * 1.35)
    expect(new Set((await prisma.freshLeafTicket.findMany({ where: { parcel_id: b2.id }, select: { cycle_id: true } })).map((t) => t.cycle_id)).size).toBe(1)
  })
})
