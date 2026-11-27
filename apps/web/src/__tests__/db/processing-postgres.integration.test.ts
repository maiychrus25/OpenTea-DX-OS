/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Runs against a throwaway Postgres with every migration applied, and only when PROCESSING_TEST_DATABASE_URL is set:
//   PROCESSING_TEST_DATABASE_URL=postgresql://... npx jest src/__tests__/db/processing-postgres.integration.test.ts
// It never runs in the normal suite, which has no database.

export {} // a module of its own: `url` and `maybe` do not clash with the ledger test

const url = process.env.PROCESSING_TEST_DATABASE_URL
const maybe = url ? describe : describe.skip

maybe('processing batches on a real Postgres', () => {
  let prisma: import('@prisma/client').PrismaClient
  let batchRepo: import('@/infrastructure/db/processing/PrismaBatchRepository').PrismaBatchRepository
  let ticketRepo: import('@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository').PrismaFreshLeafTicketRepository
  let uc: typeof import('@/application/processing/BatchUseCases')
  let VoidTicket: typeof import('@/application/weighing/VoidFreshLeafTicketUseCase').VoidFreshLeafTicketUseCase

  const run = String(Date.now())
  const htxCode = `P${run.slice(-5)}`
  let htxId = ''
  let parcelId = ''
  let gradeId = ''
  let seq = 0
  const actor = () => ({ userId: 'off-1', role: 'officer', htxProfileId: htxId, htxCode })
  const accountant = () => ({ userId: 'acc-1', role: 'accountant', htxProfileId: htxId })

  const ticket = async () => {
    seq += 1
    return (await prisma.freshLeafTicket.create({
      data: { htx_profile_id: htxId, ticket_no: `${htxCode}-PC-${seq}`, household_id: (await prisma.household.findFirstOrThrow({ where: { htx_profile_id: htxId } })).id, parcel_id: parcelId, grade_id: gradeId, weighed_at: new Date(), gross_kg: '100.0', deduction_pct: '0', net_kg: '100.0', price_vnd_per_kg: 20000, amount_vnd: BigInt(2_000_000), created_by_id: 'acc-1' },
    })).id
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    ;({ prisma } = require('@/infrastructure/db/prisma.client'))
    batchRepo = new (require('@/infrastructure/db/processing/PrismaBatchRepository').PrismaBatchRepository)()
    ticketRepo = new (require('@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository').PrismaFreshLeafTicketRepository)()
    uc = require('@/application/processing/BatchUseCases')
    VoidTicket = require('@/application/weighing/VoidFreshLeafTicketUseCase').VoidFreshLeafTicketUseCase
    const htx = await prisma.htxProfile.create({ data: { name: 'HTX thử', address: 'x', crop_types: [], htx_code: htxCode } })
    htxId = htx.id
    const household = await prisma.household.create({ data: { name: 'Hộ A', phone: `09${run.slice(-8)}`, htx_profile_id: htxId } })
    parcelId = (await prisma.parcel.create({ data: { parcel_code: `P-${run}`, household_id: household.id, crop_type: 'Chè', area_ha: 1, status: 'TENDING' } })).id
    gradeId = (await prisma.leafGrade.create({ data: { htx_profile_id: htxId, name: `Loại 1 ${run}` } })).id
  })

  afterAll(async () => { await prisma.$disconnect() })

  it('numbers parallel batches of one day without a gap or a duplicate', async () => {
    const made = await Promise.all(Array.from({ length: 6 }, () => new uc.CreateBatch(batchRepo).execute(actor(), { processed_on: '2026-11-20' })))
    const numbers = made.map((b) => b.batch_code).sort()
    expect(new Set(numbers).size).toBe(6)
    expect(numbers.map((n) => Number(n.slice(-2)))).toEqual([1, 2, 3, 4, 5, 6])
    expect(numbers[0]).toBe(`${htxCode}-MS-20261120-01`)
  })

  it('lets exactly one of a void and an add-to-batch win, whichever order they run in', async () => {
    for (let round = 0; round < 8; round++) {
      const id = await ticket()
      const batch = await new uc.CreateBatch(batchRepo).execute(actor(), { processed_on: '2026-11-21' })
      const [added, voided] = await Promise.allSettled([
        new uc.AddTickets(batchRepo).execute(actor(), batch.id, [id]),
        new VoidTicket(ticketRepo).execute(accountant(), id, 'Cân nhầm'),
      ])
      const row = await prisma.freshLeafTicket.findUniqueOrThrow({ where: { id } })
      // Exactly one outcome: batched and valid, or voided and free. Never both.
      expect([added.status, voided.status].sort()).toEqual(['fulfilled', 'rejected'])
      if (added.status === 'fulfilled') {
        expect(row).toMatchObject({ status: 'VALID', processing_batch_id: batch.id })
        expect((voided as PromiseRejectedResult).reason).toMatchObject({ code: 'TICKET_IN_BATCH' })
      } else {
        expect(row).toMatchObject({ status: 'VOIDED', processing_batch_id: null })
        expect((added as PromiseRejectedResult).reason).toMatchObject({ code: 'TICKETS_CHANGED' })
      }
    }
  })

  it('refuses to void a ticket already in a batch and frees it when the ticket leaves', async () => {
    const id = await ticket()
    const batch = await new uc.CreateBatch(batchRepo).execute(actor(), { processed_on: '2026-11-22' })
    await new uc.AddTickets(batchRepo).execute(actor(), batch.id, [id])
    await expect(new VoidTicket(ticketRepo).execute(accountant(), id, 'Cân nhầm')).rejects.toMatchObject({ code: 'TICKET_IN_BATCH', message: expect.stringContaining(batch.batch_code) })
    await new uc.RemoveTicket(batchRepo).execute(actor(), batch.id, id)
    expect((await new VoidTicket(ticketRepo).execute(accountant(), id, 'Cân nhầm')).status).toBe('VOIDED')
  })

  it('two parallel adds of one ticket to two batches: one wins, the loser keeps nothing', async () => {
    const [x, y, id] = [await ticket(), await ticket(), await ticket()]
    const [a, b] = await Promise.all([1, 2].map(() => new uc.CreateBatch(batchRepo).execute(actor(), { processed_on: '2026-11-23' })))
    const results = await Promise.allSettled([new uc.AddTickets(batchRepo).execute(actor(), a.id, [x, id]), new uc.AddTickets(batchRepo).execute(actor(), b.id, [y, id])])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    const rows = await prisma.freshLeafTicket.findMany({ where: { id: { in: [x, y, id] } }, select: { id: true, processing_batch_id: true } })
    expect(rows.filter((r) => r.processing_batch_id).length).toBe(2)
  })

  it('finishes with the stored totals and shows the output stock untouched', async () => {
    const ids = [await ticket(), await ticket()]
    const batch = await new uc.CreateBatch(batchRepo).execute(actor(), { processed_on: '2026-11-24' })
    await new uc.AddTickets(batchRepo).execute(actor(), batch.id, ids)
    await new uc.SetOutputs(batchRepo).execute(actor(), batch.id, [{ grade: 'DINH', kg: 20 }, { grade: 'BOM', kg: 20 }])
    const done = await new uc.FinishBatch(batchRepo).execute(actor(), batch.id, {})
    expect(done.batch).toMatchObject({ status: 'FINISHED', fresh_kg: 200, dry_kg: 40, recovery_ratio: 5, out_of_band: false })
    expect(done.outputs.map((o) => o.remaining_kg)).toEqual([20, 20])
    await expect(new uc.CancelBatch(batchRepo).execute(actor(), batch.id, 'Nhập nhầm')).rejects.toMatchObject({ code: 'BATCH_NOT_OPEN' })
    await expect(prisma.$executeRaw`UPDATE processing_batch_outputs SET kg = 0 WHERE batch_id = ${batch.id}`).rejects.toThrow()
  })
})
