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
  let lotRepo: import('@/infrastructure/db/processing/PrismaLotFromBatchesRepository').PrismaLotFromBatchesRepository
  let CreateLot: typeof import('@/application/processing/CreateLotFromBatchesUseCase').CreateLotFromBatchesUseCase
  let ExportQr: typeof import('@/application/lot/ExportQrUseCase').ExportQrUseCase
  let certRepo: import('@/infrastructure/db/certificate/PrismaCertificateRepository').PrismaCertificateRepository
  let VoidTicket: typeof import('@/application/weighing/VoidFreshLeafTicketUseCase').VoidFreshLeafTicketUseCase

  const run = String(Date.now())
  const htxCode = `P${run.slice(-5)}`
  let htxId = ''
  let parcelId = ''
  let gradeId = ''
  let seq = 0
  const actor = () => ({ userId: 'off-1', role: 'officer', htxProfileId: htxId, htxCode })
  const accountant = () => ({ userId: 'acc-1', role: 'accountant', htxProfileId: htxId })

  const ticket = async (onParcel = parcelId) => {
    seq += 1
    return (await prisma.freshLeafTicket.create({
      data: { htx_profile_id: htxId, ticket_no: `${htxCode}-PC-${seq}`, household_id: (await prisma.household.findFirstOrThrow({ where: { htx_profile_id: htxId } })).id, parcel_id: onParcel, grade_id: gradeId, weighed_at: new Date(), gross_kg: '100.0', deduction_pct: '0', net_kg: '100.0', price_vnd_per_kg: 20000, amount_vnd: BigInt(2_000_000), created_by_id: 'acc-1' },
    })).id
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    ;({ prisma } = require('@/infrastructure/db/prisma.client'))
    batchRepo = new (require('@/infrastructure/db/processing/PrismaBatchRepository').PrismaBatchRepository)()
    ticketRepo = new (require('@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository').PrismaFreshLeafTicketRepository)()
    uc = require('@/application/processing/BatchUseCases')
    ExportQr = require('@/application/lot/ExportQrUseCase').ExportQrUseCase
    certRepo = new (require('@/infrastructure/db/certificate/PrismaCertificateRepository').PrismaCertificateRepository)()
    lotRepo = new (require('@/infrastructure/db/processing/PrismaLotFromBatchesRepository').PrismaLotFromBatchesRepository)()
    CreateLot = require('@/application/processing/CreateLotFromBatchesUseCase').CreateLotFromBatchesUseCase
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

  describe('lots from batches', () => {
    // A finished batch of one fresh ticket (100.0 kg) with the given dry outputs; returns the output ids by grade.
    async function finishedBatch(day: string, outputs: { grade: 'DINH' | 'BOM'; kg: number }[]) {
      const id = await ticket()
      const batch = await new uc.CreateBatch(batchRepo).execute(actor(), { processed_on: day })
      await new uc.AddTickets(batchRepo).execute(actor(), batch.id, [id])
      await new uc.SetOutputs(batchRepo).execute(actor(), batch.id, outputs)
      const done = await new uc.FinishBatch(batchRepo).execute(actor(), batch.id, { deviation_note: 'Thử nghiệm tỷ lệ lệch chuẩn' })
      return Object.fromEntries(done.outputs.map((o) => [o.grade, o.id])) as Record<'DINH' | 'BOM', string>
    }

    it('two lots drawing one stock row at once: the second gets STOCK_CHANGED and stock never goes below zero (Review Focus 2)', async () => {
      const { DINH } = await finishedBatch('2026-11-25', [{ grade: 'DINH', kg: 20 }])
      const draw = () => new CreateLot(lotRepo).execute(actor(), { grade: 'DINH', sources: [{ output_id: DINH, kg: 15 }] })
      const results = await Promise.allSettled([draw(), draw()])
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
      const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
      expect(lost.reason).toMatchObject({ code: 'STOCK_CHANGED' })
      expect(lost.reason.details.stock).toEqual(expect.arrayContaining([expect.objectContaining({ output_id: DINH, remaining_kg: 5 })]))
      const taken = await prisma.lotBatchSource.aggregate({ where: { output_id: DINH }, _sum: { kg: true } })
      expect(Number(taken._sum.kg)).toBe(15)
      const rest = await new CreateLot(lotRepo).execute(actor(), { grade: 'DINH', sources: [{ output_id: DINH, kg: 5 }] })
      expect(rest.estimated_weight_kg).toBe(5)
      expect((await lotRepo.stock(htxId, 'DINH')).find((r) => r.output_id === DINH)).toBeUndefined()
    })

    it('numbers parallel lots of one day without a gap or a duplicate, on the new and the old path', async () => {
      const { BOM } = await finishedBatch('2026-11-26', [{ grade: 'BOM', kg: 20 }])
      const made = await Promise.all(Array.from({ length: 5 }, () => new CreateLot(lotRepo).execute(actor(), { grade: 'BOM', sources: [{ output_id: BOM, kg: 1 }] })))
      expect(new Set(made.map((l) => l.lot_code)).size).toBe(5)
      // Every lot of the HTX and day, earlier tests included, holds 1..N once.
      const numbersOf = async (prefix: string) => (await prisma.lot.findMany({ where: { htx_profile_id: htxId, lot_code: { startsWith: prefix } }, select: { lot_code: true } })).map((l) => Number(l.lot_code.slice(-3))).sort((x, y) => x - y)
      const prefix = made[0].lot_code.slice(0, -3)
      const newNumbers = await numbersOf(prefix)
      expect(newNumbers).toEqual(newNumbers.map((_, i) => i + 1))
      expect(newNumbers.length).toBeGreaterThanOrEqual(5)
      const Old = require('@/infrastructure/db/lot/PrismaLotRepository').PrismaLotRepository
      const old = await Promise.all(Array.from({ length: 4 }, () => new Old().create({ commodity: 'Chè', harvest_date: new Date('2026-10-01T00:00:00Z'), parcel_ids: [parcelId], htx_profile_id: htxId, created_by_id: 'off-1' })))
      expect(new Set(old.map((l: { lot_code: string }) => l.lot_code)).size).toBe(4)
      expect(await numbersOf(old[0].lot_code.slice(0, -3))).toEqual([1, 2, 3, 4])
    })

    it('carries the grade, the sources and the lot parcel, and refuses a spraying back-dated after the weighing (Review Focus 3)', async () => {
      const { DINH } = await finishedBatch('2026-11-27', [{ grade: 'DINH', kg: 20 }])
      const ok = await new CreateLot(lotRepo).execute(actor(), { grade: 'DINH', sources: [{ output_id: DINH, kg: 4.5 }], packaging_type: 'Túi 500g' })
      const row = await prisma.lot.findUniqueOrThrow({ where: { id: ok.id }, include: { batch_sources: true, lot_parcels: true } })
      expect(row).toMatchObject({ dry_grade: 'DINH', quality_grade: 'Đinh', status: 'READY', packaging_type: 'Túi 500g', htx_profile_id: htxId })
      expect(row.batch_sources.map((s) => [s.output_id, Number(s.kg)])).toEqual([[DINH, 4.5]])
      expect(row.lot_parcels.map((p) => p.parcel_id)).toEqual([parcelId])

      // The ticket was weighed today; this spraying is dated yesterday, written down after, and is safe only in 5 days.
      const yesterday = new Date(Date.now() - 86_400_000)
      await prisma.journalEntry.create({
        data: { parcel_id: parcelId, entry_date: yesterday, activity_type: 'SPRAYING', performed_by: 'Hộ A', submitted_role: 'FARMER', status: 'APPROVED',
          activities: { create: { activity_detail: 'Phun thuốc', withdrawal_days: 6, safe_harvest_date: new Date(Date.now() + 5 * 86_400_000) } } },
      })
      await expect(new CreateLot(lotRepo).execute(actor(), { grade: 'DINH', sources: [{ output_id: DINH, kg: 1 }] })).rejects.toMatchObject({ code: 'WITHDRAWAL_NOT_PASSED', details: { parcel_code: `P-${run}` } })
      const taken = await prisma.lotBatchSource.aggregate({ where: { output_id: DINH }, _sum: { kg: true } })
      expect(Number(taken._sum.kg)).toBe(4.5)
    })
  })

  describe('export with certificates', () => {
    const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
    const newCert = (days = 30) => prisma.htxCertificate.create({
      data: { htx_profile_id: htxId, kind: 'VIETGAP', number: `VG-${++seq}-${run}`, issuer: 'Sở NN', issued_on: new Date('2026-01-01T00:00:00Z'), expires_on: new Date(Date.now() + days * 86_400_000), file_key: `para/${htxCode}/Certificates/${seq}.pdf`, file_name: 'c.pdf', file_mime: 'application/pdf', file_size: 10, created_by_id: 'mgr-1' },
    })
    // A parcel with no spraying, apart from the one the earlier tests sprayed.
    let cleanParcelId = ''
    beforeAll(async () => {
      const household = await prisma.household.findFirstOrThrow({ where: { htx_profile_id: htxId } })
      cleanParcelId = (await prisma.parcel.create({ data: { parcel_code: `PC-${run}`, household_id: household.id, crop_type: 'Chè', area_ha: 1, status: 'TENDING' } })).id
    })
    // A READY lot from a fresh finished batch of one ticket weighed now.
    async function readyLot() {
      const id = await ticket(cleanParcelId)
      const batch = await new uc.CreateBatch(batchRepo).execute(actor(), { processed_on: '2026-11-28' })
      await new uc.AddTickets(batchRepo).execute(actor(), batch.id, [id])
      const done = await (async () => { await new uc.SetOutputs(batchRepo).execute(actor(), batch.id, [{ grade: 'DINH', kg: 20 }]); return new uc.FinishBatch(batchRepo).execute(actor(), batch.id, {}) })()
      return new CreateLot(lotRepo).execute(actor(), { grade: 'DINH', sources: [{ output_id: done.outputs[0].id, kg: 20 }] })
    }
    const exporter = () => new ExportQr(
      new (require('@/infrastructure/db/lot/PrismaLotRepository').PrismaLotRepository)(),
      new (require('@/infrastructure/db/repositories/prisma-lot-trace-repository').PrismaLotTraceRepository)(),
      { uploadFile: async () => ({ presignedUrl: 'https://m/qr.png' }) } as never,
      { uploadDocument: async () => undefined } as never,
      htxCode,
      certRepo,
    )
    const trace = (code: string) => new (require('@/infrastructure/db/repositories/prisma-lot-trace-repository').PrismaLotTraceRepository)().getLotByCode(code)

    it('exports a lot from batches with its certificate, then shows a later revoke on the trace (live certificates)', async () => {
      const lot = await readyLot()
      const c = await newCert()
      await exporter().execute(lot.id, undefined, 'https://tea.example', { htxProfileId: htxId, certificateIds: [c.id] })
      const row = await prisma.lot.findUniqueOrThrow({ where: { id: lot.id }, include: { certificates: true } })
      expect(row.status).toBe('QR_EXPORTED')
      expect(row.certificates.map((x) => x.certificate_id)).toEqual([c.id])
      expect(row.certificate_keys).toContain(c.file_key)
      const before = await trace(lot.lot_code)
      expect(before.dry_grade).toBe('DINH')
      expect(before.batches).toHaveLength(1)
      expect(before.intake).toHaveLength(1)
      expect(before.is_harvest_safe).toBe(true)
      expect(before.certificates).toEqual([expect.objectContaining({ id: c.id, revoked_at: null })])
      await certRepo.revoke(htxId, c.id, 'mgr-1', 'Sai số chứng nhận')
      const after = await trace(lot.lot_code)
      expect(after.certificates[0].revoked_at).toEqual(expect.stringMatching(/^\d{4}-/))
    })

    it('answers LOT_WITHOUT_BATCH for a lot from the old path while labs is off', async () => {
      const Old = require('@/infrastructure/db/lot/PrismaLotRepository').PrismaLotRepository
      const old = await new Old().create({ commodity: 'Chè', harvest_date: new Date('2026-09-01T00:00:00Z'), parcel_ids: [parcelId], htx_profile_id: htxId, created_by_id: 'off-1' })
      await expect(exporter().execute(old.id, undefined, undefined, { htxProfileId: htxId })).rejects.toMatchObject({ code: 'LOT_WITHOUT_BATCH' })
    })

    it('refuses a certificate revoked before the export, in the check and again under the lock (Review Focus 5)', async () => {
      const lot = await readyLot()
      const c = await newCert()
      await certRepo.revoke(htxId, c.id, 'mgr-1', 'Thu hồi trước')
      await expect(exporter().execute(lot.id, undefined, undefined, { htxProfileId: htxId, certificateIds: [c.id] })).rejects.toMatchObject({ code: 'CERTIFICATE_NOT_VALID', details: { certificate_ids: [c.id] } })
      // Skip the first check: the transaction itself must refuse.
      const Repo = require('@/infrastructure/db/lot/PrismaLotRepository').PrismaLotRepository
      const data = (await trace(lot.lot_code))
      await expect(new Repo().exportQr(lot.id, data, 'u', undefined, { htxProfileId: htxId, ids: [c.id], today: today() })).rejects.toMatchObject({ code: 'CERTIFICATE_NOT_VALID' })
      expect((await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe('READY')
      expect(await prisma.lotCertificate.count({ where: { lot_id: lot.id } })).toBe(0)
    })

    it('an export waiting on the certificate lock sees a revoke that commits first and fails, writing nothing', async () => {
      const lot = await readyLot()
      const c = await newCert()
      const Repo = require('@/infrastructure/db/lot/PrismaLotRepository').PrismaLotRepository
      const data = await trace(lot.lot_code)
      let release!: () => void
      const held = new Promise<void>((resolve) => { release = resolve })
      let locked!: () => void
      const gotLock = new Promise<void>((resolve) => { locked = resolve })
      // The revoke transaction holds the row, as a slow revoke would.
      const revoking = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM htx_certificates WHERE id = ${c.id} FOR UPDATE`
        locked()
        await held
        await tx.htxCertificate.update({ where: { id: c.id }, data: { revoked_at: new Date(), revoke_reason: 'Thu hồi' } })
      })
      await gotLock
      const exporting = new Repo().exportQr(lot.id, data, 'u', undefined, { htxProfileId: htxId, ids: [c.id], today: today() }).then(() => 'exported', (e: { code?: string }) => e.code)
      await new Promise((r) => setTimeout(r, 300))
      release()
      await revoking
      expect(await exporting).toBe('CERTIFICATE_NOT_VALID')
      expect((await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe('READY')
    })

    it('a revoke racing an export: either the export fails clean, or it wins and the revoke follows it', async () => {
      for (let round = 0; round < 6; round++) {
        const lot = await readyLot()
        const c = await newCert()
        const [exported, revoked] = await Promise.allSettled([
          exporter().execute(lot.id, undefined, undefined, { htxProfileId: htxId, certificateIds: [c.id] }),
          certRepo.revoke(htxId, c.id, 'mgr-1', 'Thu hồi'),
        ])
        const row = await prisma.lot.findUniqueOrThrow({ where: { id: lot.id }, include: { certificates: true } })
        expect(revoked.status).toBe('fulfilled')
        if (exported.status === 'fulfilled') {
          expect(row.status).toBe('QR_EXPORTED')
          expect(row.certificates).toHaveLength(1)
        } else {
          expect((exported as PromiseRejectedResult).reason).toMatchObject({ code: 'CERTIFICATE_NOT_VALID' })
          expect(row.status).toBe('READY')
          expect(row.certificates).toHaveLength(0)
        }
      }
    })
  })
})
