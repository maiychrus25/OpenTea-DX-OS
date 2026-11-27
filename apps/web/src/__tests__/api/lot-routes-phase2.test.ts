/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { requireTenant } from '@/lib/api/tenant'
import * as fromBatches from '@/app/api/lots/from-batches/route'
import * as dryStock from '@/app/api/dry-stock/route'
import { FakeLotBatchPort, sprayOf } from '../../../__tests__/__mocks__/lot-batch-fakes'

const fake = new FakeLotBatchPort()

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/infrastructure/db/processing/PrismaLotFromBatchesRepository', () => ({ PrismaLotFromBatchesRepository: jest.fn(() => fake) }))

const signIn = (role: string) => (requireTenant as jest.Mock).mockResolvedValue({ userId: `${role}-1`, role, htxCode: 'TC', htxProfileId: 'htx-tc' })
const post = (data: unknown) => fromBatches.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(data) }), {})
const valid = { grade: 'DINH', sources: [{ output_id: 'o1', kg: 10 }] }
const labsBefore = process.env.DXOS_LABS

beforeEach(() => {
  jest.clearAllMocks()
  Object.assign(fake, new FakeLotBatchPort())
  fake.addOutput('o1', 'DINH', 20)
  fake.addOutput('o2', 'BOM', 20)
})
afterEach(() => { if (labsBefore === undefined) delete process.env.DXOS_LABS; else process.env.DXOS_LABS = labsBefore })

describe('POST /api/lots/from-batches', () => {
  it('answers 201 with the lot and its grade', async () => {
    signIn('officer')
    const res = await post({ ...valid, buyer_name: 'Cty A' })
    expect(res.status).toBe(201)
    expect((await res.json()).data).toMatchObject({ lot_code: 'TC-CHE-20261127-001', dry_grade: 'DINH', estimated_weight_kg: 10, status: 'READY' })
  })

  it('lets a manager do it too', async () => {
    signIn('manager')
    expect((await post(valid)).status).toBe(201)
  })

  it('answers 409 STOCK_CHANGED with the fresh stock', async () => {
    signIn('officer')
    const res = await post({ ...valid, sources: [{ output_id: 'o1', kg: 20.1 }] })
    expect(res.status).toBe(409)
    const { error } = await res.json()
    expect(error.code).toBe('STOCK_CHANGED')
    expect(error.stock).toEqual([expect.objectContaining({ output_id: 'o1', remaining_kg: 20, grade: 'DINH' })])
  })

  it('answers 422 GRADE_MISMATCH and 422 WITHDRAWAL_NOT_PASSED', async () => {
    signIn('officer')
    const mismatch = await post({ grade: 'DINH', sources: [{ output_id: 'o2', kg: 1 }] })
    expect(mismatch.status).toBe(422)
    expect((await mismatch.json()).error.code).toBe('GRADE_MISMATCH')
    fake.sprays['p-1'] = [sprayOf('2026-11-26', '2026-12-02T00:00:00+07:00', 'cycle-9')]
    const blocked = await post(valid)
    expect(blocked.status).toBe(422)
    expect((await blocked.json()).error).toMatchObject({ code: 'WITHDRAWAL_NOT_PASSED', parcel_code: 'TC-A1', weighed_on: '2026-11-27', safe_on: '2026-12-02' })
    expect(fake.lots).toHaveLength(0)
  })

  it.each([
    ['no source', { ...valid, sources: [] }],
    ['51 sources', { ...valid, sources: Array.from({ length: 51 }, (_, i) => ({ output_id: `o${i}`, kg: 1 })) }],
    ['a repeated row', { ...valid, sources: [{ output_id: 'o1', kg: 1 }, { output_id: 'o1', kg: 2 }] }],
    ['zero kg', { ...valid, sources: [{ output_id: 'o1', kg: 0 }] }],
    ['two decimals', { ...valid, sources: [{ output_id: 'o1', kg: 1.25 }] }],
    ['an unknown grade', { ...valid, grade: 'SUPER' }],
    ['an unknown key', { ...valid, total_weight_kg: 999 }],
  ])('rejects %s with 400', async (_name, body) => {
    signIn('officer')
    expect((await post(body)).status).toBe(400)
    expect(fake.lots).toHaveLength(0)
  })

  it.each(['farmer', 'accountant'])('a %s gets 403 and nothing is written', async (role) => {
    signIn(role)
    expect((await post(valid)).status).toBe(403)
    expect(fake.lots).toHaveLength(0)
  })
})

describe('GET /api/dry-stock', () => {
  const get = (query = '') => dryStock.GET(new Request(`http://x/api/dry-stock${query}`), {})

  it('lists the stock, by grade when asked', async () => {
    signIn('officer')
    expect((await (await get()).json()).data.map((r: { output_id: string }) => r.output_id)).toEqual(['o1', 'o2'])
    expect((await (await get('?grade=BOM')).json()).data.map((r: { output_id: string }) => r.output_id)).toEqual(['o2'])
    expect((await get('?grade=NOPE')).status).toBe(400)
  })

  it.each(['farmer', 'accountant'])('a %s gets 403', async (role) => {
    signIn(role)
    expect((await get()).status).toBe(403)
  })
})
