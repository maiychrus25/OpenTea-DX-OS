/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { requireTenant } from '@/lib/api/tenant'
import { NotFoundError } from '@/domain/errors'
import * as items from '@/app/api/input-items/route'
import * as itemById from '@/app/api/input-items/[id]/route'
import * as advances from '@/app/api/input-advances/route'
import * as advanceVoid from '@/app/api/input-advances/[id]/void/route'
import * as advancesExport from '@/app/api/input-advances/export.csv/route'
import * as mine from '@/app/api/ledger/mine/route'
import * as householdLedger from '@/app/api/households/[id]/ledger/route'
import * as bank from '@/app/api/households/[id]/bank/route'
import * as banks from '@/app/api/banks/route'
import { FakeInputPort } from '../../../__tests__/__mocks__/ledger-fakes'

const fake = new FakeInputPort()
const ledger = {
  householdIdsOfUser: jest.fn(async () => ['hh-1']),
  read: jest.fn(async () => ({ balance_vnd: '0', households: [], entries: [], unsettled_tickets: [], unsettled_advances: [], lines: [] })),
  setBank: jest.fn(async () => true),
  getBank: jest.fn(async (): Promise<unknown> => ({ bin: '970405', account: '8600201001234', accountName: 'NGUYEN VAN A' })),
}
const guard = { household: jest.fn(), inputAdvance: jest.fn() }

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/lib/api/tenant-guard', () => ({ TenantGuard: jest.fn(() => guard) }))
jest.mock('@/infrastructure/db/ledger/PrismaInputRepository', () => ({ PrismaInputRepository: jest.fn(() => fake) }))
jest.mock('@/infrastructure/db/ledger/PrismaLedgerRepository', () => ({ PrismaLedgerRepository: jest.fn(() => ledger) }))

const signIn = (role: string) => (requireTenant as jest.Mock).mockResolvedValue({ userId: 'u1', role, htxCode: 'TC', htxProfileId: 'htx-tc' })
const json = (method: string, data?: unknown) => ({ method, body: data === undefined ? undefined : JSON.stringify(data) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const advanceBody = { household_id: 'hh-1', item_id: 'item-1', quantity: 2 }
const postAdvance = (data: unknown) => advances.POST(new Request('http://x/api/input-advances', json('POST', data)), {})
const bankBody = { bank_bin: '970405', bank_account: '8600201001234', bank_account_name: 'NGUYEN VAN A' }
const putBank = (data: unknown) => bank.PUT(new Request('http://x', json('PUT', data)), ctx('hh-1'))

beforeEach(() => {
  jest.clearAllMocks()
  fake.advances = []
  fake.items.splice(2)
  fake.items[0].unit_price_vnd = 450000
  guard.household.mockResolvedValue(undefined)
})

describe('input items', () => {
  it('lists for the officer and creates for the accountant', async () => {
    signIn('officer')
    expect((await (await items.GET(new Request('http://x'), {})).json()).data).toHaveLength(2)
    signIn('accountant')
    const res = await items.POST(new Request('http://x', json('POST', { name: 'Phân hữu cơ', unit: 'bao', unit_price_vnd: 120000, kind: 'FERTILIZER' })), {})
    expect(res.status).toBe(201)
    expect((await res.json()).data).toMatchObject({ name: 'Phân hữu cơ', active: true })
  })

  it('answers 403 to an officer who creates, 400 to an unknown field and 409 to a name that exists', async () => {
    const body = { name: 'Phân NPK', unit: 'bao', unit_price_vnd: 1, kind: 'FERTILIZER' }
    signIn('officer')
    expect((await items.POST(new Request('http://x', json('POST', body)), {})).status).toBe(403)
    signIn('accountant')
    expect((await items.POST(new Request('http://x', json('POST', { ...body, extra: 1 })), {})).status).toBe(400)
    const dup = await items.POST(new Request('http://x', json('POST', body)), {})
    expect(dup.status).toBe(409)
    expect((await dup.json()).error.code).toBe('ITEM_EXISTS')
  })

  it('updates partly and answers 404 for another HTX item', async () => {
    signIn('manager')
    const ok = await itemById.PUT(new Request('http://x', json('PUT', { unit_price_vnd: 460000 })), ctx('item-1'))
    expect((await ok.json()).data.unit_price_vnd).toBe(460000)
    expect((await itemById.PUT(new Request('http://x', json('PUT', { active: false })), ctx('nope'))).status).toBe(404)
    expect((await itemById.PUT(new Request('http://x', json('PUT', {})), ctx('item-1'))).status).toBe(400)
  })
})

describe('POST /api/input-advances', () => {
  it('answers 201 with an amount as a decimal string', async () => {
    signIn('accountant')
    const res = await postAdvance(advanceBody)
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data).toMatchObject({ amount_vnd: '900000', status: 'VALID', settlement_id: null })
    expect(typeof data.amount_vnd).toBe('string')
  })

  it('answers 403 to a farmer and 404 when the household is not in the HTX', async () => {
    signIn('farmer')
    expect((await postAdvance(advanceBody)).status).toBe(403)
    signIn('accountant')
    guard.household.mockRejectedValue(new NotFoundError('Resource not found'))
    expect((await postAdvance(advanceBody)).status).toBe(404)
    expect(fake.advances).toHaveLength(0)
  })

  it('answers 400 to a bad quantity, an unknown field and a bad client id', async () => {
    signIn('accountant')
    for (const bad of [{ quantity: 0 }, { quantity: 1.234 }, { quantity: 100001 }, { extra: 1 }, { client_id: 'x' }, { advanced_on: '2026-02-31' }]) {
      expect((await postAdvance({ ...advanceBody, ...bad })).status).toBe(400)
    }
  })

  it('answers 200 with the first advance for a replay of the same client_id', async () => {
    signIn('accountant')
    const body = { ...advanceBody, client_id: '33333333-3333-4333-8333-333333333333' }
    const first = await (await postAdvance(body)).json()
    const again = await postAdvance(body)
    expect(again.status).toBe(200)
    expect((await again.json()).data.id).toBe(first.data.id)
  })

  it('lets the officer read the list but not write', async () => {
    signIn('officer')
    expect((await advances.GET(new Request('http://x/api/input-advances?status=VALID'), {})).status).toBe(200)
    expect((await postAdvance(advanceBody)).status).toBe(403)
    signIn('farmer')
    expect((await advances.GET(new Request('http://x/api/input-advances'), {})).status).toBe(403)
  })
})

describe('void and export', () => {
  const voidIt = () => advanceVoid.POST(new Request('http://x', json('POST', { reason: 'Nhập nhầm' })), ctx('adv-1'))

  it('answers 409 ADVANCE_SETTLED, 404 for another HTX and 400 without a reason', async () => {
    signIn('accountant')
    fake.voidOutcome = { kind: 'settled' }
    const res = await voidIt()
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('ADVANCE_SETTLED')
    guard.inputAdvance.mockRejectedValueOnce(new NotFoundError('Resource not found'))
    expect((await voidIt()).status).toBe(404)
    expect((await advanceVoid.POST(new Request('http://x', json('POST', { reason: '' })), ctx('adv-1'))).status).toBe(400)
  })

  it('exports a csv for staff with a formula-safe cell', async () => {
    signIn('accountant')
    fake.advances = [{ id: 'a1', advance_no: 'TC-VT-20261128-001', household_id: 'hh-1', household_name: '=HYPERLINK("x")', item_id: 'i', item_name: 'Phân', unit: 'bao', quantity: 2, unit_price_vnd: 450000, amount_vnd: '900000', advanced_on: '2026-11-28', status: 'VALID', void_reason: null, settlement_id: null }]
    const res = await advancesExport.GET(new Request('http://x/api/input-advances/export.csv?from=2026-11-01&to=2026-11-30'), {})
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('"\'=HYPERLINK(""x"")"')
    signIn('officer')
    expect((await advancesExport.GET(new Request('http://x/api/input-advances/export.csv?from=2026-11-01&to=2026-11-30'), {})).status).toBe(403)
  })
})

describe('ledger reads', () => {
  it('lets a farmer read /ledger/mine and nobody else', async () => {
    signIn('farmer')
    expect((await mine.GET(new Request('http://x'), {})).status).toBe(200)
    expect(ledger.read).toHaveBeenCalledWith('htx-tc', ['hh-1'])
    signIn('accountant')
    expect((await mine.GET(new Request('http://x'), {})).status).toBe(403)
  })

  it('lets staff read one household, checks the HTX and refuses a farmer and an officer', async () => {
    signIn('manager')
    expect((await householdLedger.GET(new Request('http://x'), ctx('hh-1'))).status).toBe(200)
    guard.household.mockRejectedValueOnce(new NotFoundError('Resource not found'))
    expect((await householdLedger.GET(new Request('http://x'), ctx('hh-9'))).status).toBe(404)
    signIn('farmer')
    expect((await householdLedger.GET(new Request('http://x'), ctx('hh-1'))).status).toBe(403)
    signIn('officer')
    expect((await householdLedger.GET(new Request('http://x'), ctx('hh-1'))).status).toBe(403)
  })
})

describe('bank details', () => {
  it('stores the account and answers with the masked number only', async () => {
    signIn('accountant')
    const res = await putBank(bankBody)
    expect(res.status).toBe(200)
    const text = JSON.stringify(await res.json())
    expect(JSON.parse(text).data).toEqual({ bank_bin: '970405', bank_name: 'Agribank', account_masked: '*********1234', bank_account_name: 'NGUYEN VAN A' })
    expect(text).not.toContain('8600201001234')
    // The person who changed the payout account is named in the audit row.
    expect(ledger.setBank).toHaveBeenCalledWith('htx-tc', 'hh-1', { bin: '970405', account: '8600201001234', accountName: 'NGUYEN VAN A' }, 'u1')
  })

  it('rejects an unknown BIN, letters in the account, a long name and a farmer', async () => {
    signIn('manager')
    expect((await putBank({ ...bankBody, bank_bin: '000000' })).status).toBe(400)
    expect((await putBank({ ...bankBody, bank_account: '12ab56' })).status).toBe(400)
    expect((await putBank({ ...bankBody, bank_account: '12345' })).status).toBe(400)
    expect((await putBank({ ...bankBody, bank_account_name: 'x'.repeat(61) })).status).toBe(400)
    expect(ledger.setBank).not.toHaveBeenCalled()
    signIn('farmer')
    expect((await putBank(bankBody)).status).toBe(403)
  })

  it('does not echo the account number in an error', async () => {
    signIn('manager')
    const res = await putBank({ ...bankBody, bank_account: '12ab56', extra: 1 })
    expect(JSON.stringify(await res.json())).not.toContain('12ab56')
  })

  it('prefills the form for staff with the full number, null without details, 404 for another HTX', async () => {
    const get = () => bank.GET(new Request('http://x'), ctx('hh-1'))
    signIn('accountant')
    expect((await (await get()).json()).data).toEqual({ bank_bin: '970405', bank_name: 'Agribank', bank_account: '8600201001234', account_masked: '*********1234', bank_account_name: 'NGUYEN VAN A' })
    ledger.getBank.mockResolvedValueOnce(null)
    expect((await (await get()).json()).data).toBeNull()
    guard.household.mockRejectedValueOnce(new NotFoundError('Resource not found'))
    expect((await get()).status).toBe(404)
    signIn('farmer')
    expect((await get()).status).toBe(403)
    signIn('officer')
    expect((await get()).status).toBe(403)
  })

  it('lists the 21 banks', async () => {
    signIn('farmer')
    const { data } = await (await banks.GET(new Request('http://x'), {})).json()
    expect(data).toHaveLength(21)
    expect(data[0]).toEqual({ bin: '970405', name: 'Agribank' })
  })
})
