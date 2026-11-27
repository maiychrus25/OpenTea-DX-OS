/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Runs against a throwaway Postgres with every migration applied, and only when LEDGER_TEST_DATABASE_URL is set:
//   LEDGER_TEST_DATABASE_URL=postgresql://... npx jest src/__tests__/db/ledger-postgres.integration.test.ts
// It never runs in the normal suite, which has no database.

const url = process.env.LEDGER_TEST_DATABASE_URL
const maybe = url ? describe : describe.skip

maybe('ledger on a real Postgres', () => {
  let prisma: import('@prisma/client').PrismaClient
  let inputRepo: import('@/infrastructure/db/ledger/PrismaInputRepository').PrismaInputRepository
  let ledgerRepo: import('@/infrastructure/db/ledger/PrismaLedgerRepository').PrismaLedgerRepository
  let CreateAdvance: typeof import('@/application/ledger/CreateInputAdvanceUseCase').CreateInputAdvanceUseCase
  let VoidAdvance: typeof import('@/application/ledger/VoidInputAdvanceUseCase').VoidInputAdvanceUseCase
  let SetBank: typeof import('@/application/ledger/SetHouseholdBankUseCase').SetHouseholdBankUseCase
  let pesticides: import('@/infrastructure/db/pesticide/PrismaPesticideRepository').PrismaPesticideRepository

  const run = String(Date.now())
  const htxCode = `T${run.slice(-5)}`
  let htxId = ''
  let householdId = ''
  let otherHouseholdId = ''
  const actor = () => ({ userId: 'acc-1', role: 'accountant', htxProfileId: htxId, htxCode })

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    ;({ prisma } = require('@/infrastructure/db/prisma.client'))
    const InputRepo = require("@/infrastructure/db/ledger/PrismaInputRepository").PrismaInputRepository
    inputRepo = new InputRepo()
    ledgerRepo = new (require('@/infrastructure/db/ledger/PrismaLedgerRepository').PrismaLedgerRepository)()
    CreateAdvance = require('@/application/ledger/CreateInputAdvanceUseCase').CreateInputAdvanceUseCase
    VoidAdvance = require('@/application/ledger/VoidInputAdvanceUseCase').VoidInputAdvanceUseCase
    SetBank = require('@/application/ledger/SetHouseholdBankUseCase').SetHouseholdBankUseCase
    pesticides = new (require('@/infrastructure/db/pesticide/PrismaPesticideRepository').PrismaPesticideRepository)()
    const htx = await prisma.htxProfile.create({ data: { name: 'HTX thử', address: 'x', crop_types: [], htx_code: htxCode } })
    htxId = htx.id
    householdId = (await prisma.household.create({ data: { name: 'Hộ A', phone: `09${run.slice(-8)}`, htx_profile_id: htxId } })).id
    otherHouseholdId = (await prisma.household.create({ data: { name: 'Hộ B', phone: `08${run.slice(-8)}`, htx_profile_id: htxId } })).id
    await prisma.inputItem.create({ data: { id: `it-${run}`, htx_profile_id: htxId, name: 'Phân NPK', unit: 'bao', unit_price_vnd: 450000, kind: 'FERTILIZER' } })
  })

  afterAll(async () => { await prisma.$disconnect() })

  it('numbers parallel advances without a gap or a duplicate and copies the price', async () => {
    const useCase = new CreateAdvance(inputRepo)
    const made = await Promise.all(Array.from({ length: 6 }, () => useCase.execute(actor(), { household_id: householdId, item_id: `it-${run}`, quantity: 1.5 })))
    const numbers = made.map((m) => m.advance.advance_no).sort()
    expect(new Set(numbers).size).toBe(6)
    expect(numbers.map((n) => Number(n.slice(-3)))).toEqual([1, 2, 3, 4, 5, 6])
    expect(made[0].advance).toMatchObject({ unit_price_vnd: 450000, amount_vnd: '675000', quantity: 1.5 })
  })

  it('returns the first advance for a replayed client_id and refuses a foreign household', async () => {
    const useCase = new CreateAdvance(inputRepo)
    const client_id = '44444444-4444-4444-8444-444444444444'
    const first = await useCase.execute(actor(), { household_id: householdId, item_id: `it-${run}`, quantity: 1, client_id })
    const again = await useCase.execute(actor(), { household_id: householdId, item_id: `it-${run}`, quantity: 1, client_id })
    expect(again.created).toBe(false)
    expect(again.advance.id).toBe(first.advance.id)
    await expect(useCase.execute({ ...actor(), htxProfileId: 'other-htx' }, { household_id: householdId, item_id: `it-${run}`, quantity: 1 })).rejects.toThrow('Không tìm thấy')
  })

  it('voids once and then answers already voided', async () => {
    const { advance } = await new CreateAdvance(inputRepo).execute(actor(), { household_id: otherHouseholdId, item_id: `it-${run}`, quantity: 2 })
    const voidIt = () => new VoidAdvance(inputRepo).execute(actor(), advance.id, 'Nhập nhầm')
    expect((await voidIt()).status).toBe('VOIDED')
    await expect(voidIt()).rejects.toMatchObject({ code: 'ADVANCE_VOIDED' })
  })

  it('shows unsettled advances as a negative balance and keeps a voided one out', async () => {
    const read = await ledgerRepo.read(htxId, [otherHouseholdId, 'foreign-household'])
    expect(read.households.map((h) => h.household_id)).toEqual([otherHouseholdId])
    expect(read.balance_vnd).toBe('0')
    expect(read.unsettled_advances).toHaveLength(0)
    const mine = await ledgerRepo.read(htxId, [householdId])
    expect(BigInt(mine.balance_vnd) < BigInt(0)).toBe(true)
    expect(mine.unsettled_advances.length).toBeGreaterThan(0)
  })

  it('stores a bank account, answers masked, and the database refuses a bad account', async () => {
    const out = await new SetBank(ledgerRepo).execute(actor(), householdId, { bank_bin: '970405', bank_account: '8600201001234', bank_account_name: 'NGUYEN VAN A' })
    expect(out.account_masked).toBe('*********1234')
    await expect(prisma.$executeRaw`UPDATE households SET bank_account = '12ab' WHERE id = ${householdId}`).rejects.toThrow()
    await expect(new SetBank(ledgerRepo).execute({ ...actor(), htxProfileId: 'other-htx' }, householdId, { bank_bin: '970405', bank_account: '8600201001234', bank_account_name: 'X' })).rejects.toThrow('Không tìm thấy')
  })

  it('puts a pesticide advanced to the household first in the catalogue', async () => {
    const [first, second] = await Promise.all(['a', 'b'].map((k) => prisma.pesticideProduct.create({ data: { trade_name: `Thuốc ${k}${run}`, active_ingredient: 'x', group: 'CHEMICAL', targets: [], default_phi_days: 7, source: 'test' } })))
    await prisma.inputItem.create({ data: { htx_profile_id: htxId, name: `Thuốc ứng ${run}`, unit: 'chai', unit_price_vnd: 80000, kind: 'PESTICIDE', pesticide_product_id: second.id } })
    const item = await prisma.inputItem.findFirstOrThrow({ where: { pesticide_product_id: second.id } })
    await new CreateAdvance(inputRepo).execute(actor(), { household_id: householdId, item_id: item.id, quantity: 1 })
    const ids = (await pesticides.list(htxId, { householdId })).map((p) => p.id)
    expect(ids.indexOf(second.id)).toBe(0)
    expect(ids).toContain(first.id)
    expect((await pesticides.list(htxId, { householdId: otherHouseholdId })).map((p) => p.id)[0]).not.toBe(second.id)
  })

  describe('closing, paying and the slip', () => {
    const manager = () => ({ userId: 'mgr-1', role: 'manager', htxProfileId: htxId, htxCode, userName: 'Trưởng HTX' })
    const farmerActor = (userId: string) => ({ userId, role: 'farmer', htxProfileId: htxId, htxCode })
    let settlement: import('@/infrastructure/db/ledger/PrismaSettlementRepository').PrismaSettlementRepository
    let uc: typeof import('@/application/ledger/SettlementUseCases')
    let periodId = ''
    let lines: { id: string | null; household_id: string; payable_vnd: string }[] = []
    const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
    const balance = async (id: string) => (await prisma.memberLedgerEntry.aggregate({ where: { household_id: id }, _sum: { amount_vnd: true } }))._sum.amount_vnd ?? BigInt(0)

    beforeAll(async () => {
      settlement = new (require('@/infrastructure/db/ledger/PrismaSettlementRepository').PrismaSettlementRepository)()
      uc = require('@/application/ledger/SettlementUseCases')
      const parcel = await prisma.parcel.create({ data: { parcel_code: `P-${run}`, household_id: householdId, crop_type: 'Chè', area_ha: 1, status: 'TENDING' } })
      const grade = await prisma.leafGrade.create({ data: { htx_profile_id: htxId, name: `Loại 1 ${run}` } })
      const ticket = (household_id: string, no: string, net: string, amount: bigint) => prisma.freshLeafTicket.create({
        data: { htx_profile_id: htxId, ticket_no: `${htxCode}-PC-${no}`, household_id, parcel_id: parcel.id, grade_id: grade.id, weighed_at: new Date(), gross_kg: net, deduction_pct: '0', net_kg: net, price_vnd_per_kg: 20000, amount_vnd: amount, created_by_id: 'acc-1' },
      })
      await ticket(householdId, '001', '500.0', BigInt(10_000_000))
      await ticket(otherHouseholdId, '002', '50.0', BigInt(1_000_000))
      await prisma.household.update({ where: { id: householdId }, data: { keycloak_user_id: `farmer-${run}` } })
    })

    it('refuses a period before the first slip day is covered, then creates today as a draft', async () => {
      const create = new uc.CreateSettlementPeriodUseCase(settlement)
      await expect(create.execute({ ...manager(), role: 'accountant' }, { date_from: '2999-01-01', date_to: '2999-01-02' })).rejects.toThrow('sau hôm nay')
      await expect(create.execute(manager(), { date_from: '2999-01-01', date_to: today() })).rejects.toThrow('Còn phiếu trước')
      periodId = (await create.execute({ ...manager(), role: 'accountant' }, { date_from: today(), date_to: today() })).id
      await expect(create.execute(manager(), { date_from: today(), date_to: today() })).rejects.toThrow('kỳ nháp')
    })

    it('previews the settled numbers from real rows', async () => {
      const detail = await new uc.GetSettlementUseCase(settlement).execute(manager(), periodId)
      lines = detail.lines
      expect(detail.totals).toMatchObject({ households: 2, leaf_amount_vnd: '11000000', advances_vnd: '4580000', payable_vnd: '6420000', debt_out_vnd: '0' })
      expect(detail.lines.every((l) => l.id === null && l.period_id === periodId)).toBe(true)
    })

    it('answers PERIOD_CHANGED and writes nothing when the expected numbers differ', async () => {
      const close = new uc.CloseSettlementPeriodUseCase(settlement)
      await expect(close.execute(manager(), periodId, { household_count: 2, payable_total_vnd: '1' })).rejects.toMatchObject({ code: 'PERIOD_CHANGED' })
      expect(await prisma.memberSettlement.count({ where: { period_id: periodId } })).toBe(0)
      expect(await prisma.memberLedgerEntry.count({ where: { htx_profile_id: htxId } })).toBe(0)
      expect((await prisma.settlementPeriod.findUniqueOrThrow({ where: { id: periodId } })).status).toBe('DRAFT')
      await expect(close.execute({ ...manager(), role: 'accountant' }, periodId, { household_count: 2, payable_total_vnd: '6420000' })).rejects.toThrow('Forbidden')
    })

    it('closes once even when two managers press at the same time, with the invariant for every household', async () => {
      const close = new uc.CloseSettlementPeriodUseCase(settlement)
      const results = await Promise.allSettled([1, 2].map(() => close.execute(manager(), periodId, { household_count: 2, payable_total_vnd: '6420000' })))
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'PERIOD_CLOSED' })
      expect(await prisma.memberSettlement.count({ where: { period_id: periodId } })).toBe(2)
      expect(await prisma.memberLedgerEntry.count({ where: { htx_profile_id: htxId } })).toBe(3)
      const closedLines = await prisma.memberSettlement.findMany({ where: { period_id: periodId } })
      for (const line of closedLines) {
        const unpaid = closedLines.filter((l) => l.household_id === line.household_id && !l.paid_at).reduce((sum, l) => sum + l.payable_vnd, BigInt(0))
        expect((await balance(line.household_id)) - unpaid).toBe(-line.debt_out_vnd)
      }
      expect(await prisma.freshLeafTicket.count({ where: { htx_profile_id: htxId, settlement_id: null } })).toBe(0)
      expect(await prisma.inputAdvance.count({ where: { htx_profile_id: htxId, status: 'VALID', settlement_id: null } })).toBe(0)
      const period = await prisma.settlementPeriod.findUniqueOrThrow({ where: { id: periodId } })
      expect(period).toMatchObject({ status: 'CLOSED', closed_by_id: 'mgr-1', closed_by_name: 'Trưởng HTX' })
      const audited = await prisma.$queryRaw<{ actor: string }[]>`SELECT actor FROM audit.events WHERE table_name = 'settlement_periods' AND row_id = ${periodId} AND op = 'UPDATE'`
      expect(audited.map((a) => a.actor)).toContain('user:mgr-1')
    })

    it('refuses UPDATE and DELETE of a ledger row in the database', async () => {
      const entry = await prisma.memberLedgerEntry.findFirstOrThrow({ where: { htx_profile_id: htxId } })
      await expect(prisma.$executeRaw`UPDATE member_ledger_entries SET amount_vnd = 1 WHERE id = ${entry.id}`).rejects.toThrow(/append-only/)
      await expect(prisma.$executeRaw`DELETE FROM member_ledger_entries WHERE id = ${entry.id}`).rejects.toThrow(/append-only/)
    })

    it('refuses to void a settled ticket or advance', async () => {
      const ticket = await prisma.freshLeafTicket.findFirstOrThrow({ where: { htx_profile_id: htxId } })
      const { PrismaFreshLeafTicketRepository } = require('@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository')
      expect((await new PrismaFreshLeafTicketRepository().voidTicket({ htxProfileId: htxId, id: ticket.id, reason: 'x', userId: 'u', at: new Date() })).kind).toBe('settled')
      const advance = await prisma.inputAdvance.findFirstOrThrow({ where: { htx_profile_id: htxId, status: 'VALID' } })
      await expect(new VoidAdvance(inputRepo).execute(actor(), advance.id, 'Nhập nhầm')).rejects.toMatchObject({ code: 'ADVANCE_SETTLED' })
    })

    it('records a payout once under two parallel calls and the household balance returns to zero', async () => {
      const line = lines.find((l) => l.household_id === householdId)!
      const closedLine = await prisma.memberSettlement.findFirstOrThrow({ where: { period_id: periodId, household_id: householdId } })
      expect(closedLine.payable_vnd).toBe(BigInt(5_420_000))
      const pay = new uc.RecordPayoutUseCase(settlement)
      const results = await Promise.allSettled([1, 2].map(() => pay.execute({ ...actor(), role: 'accountant' }, periodId, closedLine.id, { method: 'TRANSFER', ref: 'FT1' })))
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'ALREADY_PAID' })
      expect(await prisma.memberLedgerEntry.count({ where: { household_id: householdId, entry_type: 'PAYOUT' } })).toBe(1)
      expect(await balance(householdId)).toBe(BigInt(0))
      expect(line.household_id).toBe(householdId)
    })

    it('shows staff the full account and a farmer only the masked one, and the QR amount is the payable', async () => {
      const closedLine = await prisma.memberSettlement.findFirstOrThrow({ where: { period_id: periodId, household_id: householdId } })
      let encoded = ''
      const slip = new uc.GetSettlementSlipUseCase(settlement, async (text) => { encoded = text; return 'data:image/png;base64,AAA' })
      const staffSlip = await slip.execute({ ...actor(), role: 'accountant' }, periodId, closedLine.id)
      expect(staffSlip.qr).toMatchObject({ bank_name: 'Agribank', account_full: '8600201001234', account_masked: '*********1234' })
      expect(encoded).toContain('54075420000')
      expect(staffSlip.tickets).toHaveLength(1)
      expect(staffSlip.advances.length).toBeGreaterThan(0)
      const mineSlip = await slip.execute(farmerActor(`farmer-${run}`), periodId, closedLine.id)
      expect(mineSlip.qr).not.toHaveProperty('account_full')
      await expect(slip.execute(farmerActor('someone-else'), periodId, closedLine.id)).rejects.toThrow('Không tìm thấy')
      await expect(slip.execute({ ...actor(), htxProfileId: 'other-htx' }, periodId, closedLine.id)).rejects.toThrow('Không tìm thấy')
      const noBank = await prisma.memberSettlement.findFirstOrThrow({ where: { period_id: periodId, household_id: otherHouseholdId } })
      expect((await slip.execute({ ...actor(), role: 'accountant' }, periodId, noBank.id)).qr).toBeNull()
    })

    it('reads the farmer ledger with period_id on every line and a zero balance', async () => {
      const { ReadLedgerUseCase } = require('@/application/ledger/ReadLedgerUseCase')
      const read = await new ReadLedgerUseCase(ledgerRepo).mine(farmerActor(`farmer-${run}`))
      expect(read.balance_vnd).toBe('0')
      expect(read.lines[0]).toMatchObject({ period_id: periodId, payable_vnd: '5420000' })
      expect(read.entries.map((e: { entry_type: string }) => e.entry_type).sort()).toEqual(['INPUT_DEBIT', 'LEAF_CREDIT', 'PAYOUT'])
    })

    it('books a manager adjustment next to the unpaid payable of the household', async () => {
      const book = (household_id: string, amount: bigint) => prisma.memberLedgerEntry.create({ data: { htx_profile_id: htxId, household_id, entry_type: 'ADJUSTMENT', amount_vnd: amount, created_by_id: 'mgr-1', note: 'nợ cũ' } })
      await book(otherHouseholdId, BigInt(-300_000))
      const out = await new uc.CreateLedgerAdjustmentUseCase(settlement).execute(manager(), { household_id: otherHouseholdId, amount_vnd: '-1', reason: 'Làm tròn' })
      expect(out.amount_vnd).toBe('-1')
      const outstanding = await balance(otherHouseholdId)
      // the 1,000,000 payable of the other household is still unpaid and sits in the balance
      expect(outstanding).toBe(BigInt(1_000_000) - BigInt(300_001))
    })
  })
})
