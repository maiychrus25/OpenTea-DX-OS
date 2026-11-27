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
})
