/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { requireTenant } from '@/lib/api/tenant'
import { NotFoundError } from '@/domain/errors'
import * as batches from '@/app/api/processing-batches/route'
import * as batchById from '@/app/api/processing-batches/[id]/route'
import * as available from '@/app/api/processing-batches/available-tickets/route'
import * as addTickets from '@/app/api/processing-batches/[id]/tickets/route'
import * as removeTicket from '@/app/api/processing-batches/[id]/tickets/[ticketId]/route'
import * as outputs from '@/app/api/processing-batches/[id]/outputs/route'
import * as finish from '@/app/api/processing-batches/[id]/finish/route'
import * as cancel from '@/app/api/processing-batches/[id]/cancel/route'
import { FakeBatchPort } from '../../../__tests__/__mocks__/batch-fakes'

const fake = new FakeBatchPort()
const guard = { processingBatch: jest.fn() }

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/lib/api/tenant-guard', () => ({ TenantGuard: jest.fn(() => guard) }))
jest.mock('@/infrastructure/db/processing/PrismaBatchRepository', () => ({ PrismaBatchRepository: jest.fn(() => fake) }))

const signIn = (role: string) => (requireTenant as jest.Mock).mockResolvedValue({ userId: `${role}-1`, role, htxCode: 'TC', htxProfileId: 'htx-tc' })
const req = (method: string, data?: unknown) => new Request('http://x', { method, body: data === undefined ? undefined : JSON.stringify(data) })
const ctx = (id: string, ticketId?: string) => ({ params: Promise.resolve({ id, ticketId }) })
const today = () => new Date().toISOString().slice(0, 10)

async function createBatch(): Promise<string> {
  signIn('officer')
  const res = await batches.POST(req('POST', { processed_on: '2020-01-01' }), {})
  return (await res.json()).data.id
}

beforeEach(() => {
  jest.clearAllMocks()
  Object.assign(fake, new FakeBatchPort())
  fake.addTicket('t1', 95)
  fake.addTicket('t2', 95)
  fake.addTicket('t3', 237.5)
  guard.processingBatch.mockResolvedValue(undefined)
})

describe('batch routes', () => {
  it('creates a batch (201), lists it and reads it with a preview', async () => {
    const id = await createBatch()
    const list = await (await batches.GET(req('GET'), {})).json()
    expect(list.data.map((b: { id: string }) => b.id)).toEqual([id])
    const one = (await (await batchById.GET(req('GET'), ctx(id))).json()).data
    expect(one).toMatchObject({ batch: { status: 'OPEN', batch_code: 'TC-MS-20200101-01' }, tickets: [], outputs: [], preview: { recovery_ratio: null, out_of_band: false } })
  })

  it('answers 422 DOMAIN_ERROR for a day after today and 400 for a bad body', async () => {
    signIn('manager')
    const future = await batches.POST(req('POST', { processed_on: '2999-01-01' }), {})
    expect(future.status).toBe(422)
    expect((await future.json()).error.code).toBe('DOMAIN_ERROR')
    for (const bad of [{}, { processed_on: '2026-02-31' }, { processed_on: today(), extra: 1 }, { processed_on: today(), shift: 'x'.repeat(41) }]) {
      expect((await batches.POST(req('POST', bad), {})).status).toBe(400)
    }
  })

  it('adds and removes tickets, with TICKETS_CHANGED and BATCH_NOT_OPEN as 409', async () => {
    const id = await createBatch()
    const added = await addTickets.POST(req('POST', { ticket_ids: ['t1', 't2'] }), ctx(id))
    expect(added.status).toBe(200)
    expect((await added.json()).data.batch.ticket_count).toBe(2)
    const changed = await addTickets.POST(req('POST', { ticket_ids: ['t3', 't1'] }), ctx(id))
    expect(changed.status).toBe(409)
    expect((await changed.json()).error.code).toBe('TICKETS_CHANGED')
    const removed = await removeTicket.DELETE(req('DELETE'), ctx(id, 't1'))
    expect((await removed.json()).data.batch.ticket_count).toBe(1)
    expect((await removeTicket.DELETE(req('DELETE'), ctx(id, 't1'))).status).toBe(404)
    await cancel.POST(req('POST', { reason: 'Nhập nhầm' }), ctx(id))
    for (const res of [await addTickets.POST(req('POST', { ticket_ids: ['t1'] }), ctx(id)), await removeTicket.DELETE(req('DELETE'), ctx(id, 't2')), await outputs.PUT(req('PUT', { outputs: [] }), ctx(id))]) {
      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('BATCH_NOT_OPEN')
    }
  })

  it.each([
    ['no ticket', { ticket_ids: [] }],
    ['201 tickets', { ticket_ids: Array.from({ length: 201 }, (_, i) => `t${i}`) }],
    ['a repeated ticket', { ticket_ids: ['t1', 't1'] }],
    ['an unknown key', { ticket_ids: ['t1'], force: true }],
  ])('rejects %s with 400', async (_name, body) => {
    const id = await createBatch()
    expect((await addTickets.POST(req('POST', body), ctx(id))).status).toBe(400)
  })

  it.each([
    ['six outputs', { outputs: ['DINH', 'TOM_NON', 'MOC_CAU', 'BOM', 'CAM', 'DINH'].map((grade) => ({ grade, kg: 1 })) }],
    ['a repeated grade', { outputs: [{ grade: 'DINH', kg: 1 }, { grade: 'DINH', kg: 2 }] }],
    ['an unknown grade', { outputs: [{ grade: 'SUPER', kg: 1 }] }],
    ['zero kg', { outputs: [{ grade: 'DINH', kg: 0 }] }],
    ['100000.1 kg', { outputs: [{ grade: 'DINH', kg: 100000.1 }] }],
    ['two decimals', { outputs: [{ grade: 'DINH', kg: 1.25 }] }],
  ])('rejects outputs with %s', async (_name, body) => {
    const id = await createBatch()
    expect((await outputs.PUT(req('PUT', body), ctx(id))).status).toBe(400)
  })

  it('finishes: BATCH_EMPTY and DEVIATION_NOTE_REQUIRED as 422, then a finished batch', async () => {
    const id = await createBatch()
    const empty = await finish.POST(req('POST', {}), ctx(id))
    expect(empty.status).toBe(422)
    expect((await empty.json()).error.code).toBe('BATCH_EMPTY')
    await addTickets.POST(req('POST', { ticket_ids: ['t1', 't2', 't3'] }), ctx(id))
    await outputs.PUT(req('PUT', { outputs: [{ grade: 'DINH', kg: 85.4 }] }), ctx(id))
    const noNote = await finish.POST(req('POST', {}), ctx(id))
    expect(noNote.status).toBe(422)
    expect((await noNote.json()).error).toMatchObject({ code: 'DEVIATION_NOTE_REQUIRED', recovery_ratio: 5.01 })
    expect((await finish.POST(req('POST', { deviation_note: 'ngắn' }), ctx(id))).status).toBe(400)
    const done = await finish.POST(req('POST', { deviation_note: 'Búp héo do để qua đêm' }), ctx(id))
    expect(done.status).toBe(200)
    expect((await done.json()).data.batch).toMatchObject({ status: 'FINISHED', out_of_band: true })
  })

  it('cancels with a reason of 3 to 200 characters and returns the batch view', async () => {
    const id = await createBatch()
    for (const reason of ['', 'ab', 'x'.repeat(201), undefined]) expect((await cancel.POST(req('POST', { reason }), ctx(id))).status).toBe(400)
    const res = await cancel.POST(req('POST', { reason: 'Mở nhầm ngày' }), ctx(id))
    expect((await res.json()).data).toMatchObject({ status: 'CANCELLED', cancel_reason: 'Mở nhầm ngày' })
  })

  it('lists the tickets that can be picked, with a range check', async () => {
    signIn('manager')
    expect((await (await available.GET(req('GET'), {})).json()).data).toHaveLength(3)
    const bad = new Request('http://x/api/processing-batches/available-tickets?from=2026-11-10&to=2026-11-01')
    expect((await available.GET(bad, {})).status).toBe(400)
  })

  it("answers 404 for another HTX's batch before anything is read or written", async () => {
    signIn('officer')
    guard.processingBatch.mockRejectedValue(new NotFoundError('Resource not found'))
    const calls = [
      batchById.GET(req('GET'), ctx('b-x')),
      addTickets.POST(req('POST', { ticket_ids: ['t1'] }), ctx('b-x')),
      removeTicket.DELETE(req('DELETE'), ctx('b-x', 't1')),
      outputs.PUT(req('PUT', { outputs: [] }), ctx('b-x')),
      finish.POST(req('POST', {}), ctx('b-x')),
      cancel.POST(req('POST', { reason: 'Nhập nhầm' }), ctx('b-x')),
    ]
    for (const res of await Promise.all(calls)) expect(res.status).toBe(404)
    expect(fake.batches).toHaveLength(0)
  })

  it.each(['farmer', 'accountant'])('a %s gets 403 on every route and nothing is looked up', async (role) => {
    signIn(role)
    const calls = [
      batches.GET(req('GET'), {}),
      batches.POST(req('POST', { processed_on: today() }), {}),
      batchById.GET(req('GET'), ctx('b-1')),
      available.GET(req('GET'), {}),
      addTickets.POST(req('POST', { ticket_ids: ['t1'] }), ctx('b-1')),
      removeTicket.DELETE(req('DELETE'), ctx('b-1', 't1')),
      outputs.PUT(req('PUT', { outputs: [] }), ctx('b-1')),
      finish.POST(req('POST', {}), ctx('b-1')),
      cancel.POST(req('POST', { reason: 'Nhập nhầm' }), ctx('b-1')),
    ]
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403)
    expect(guard.processingBatch).not.toHaveBeenCalled()
    expect(fake.batches).toHaveLength(0)
  })
})
