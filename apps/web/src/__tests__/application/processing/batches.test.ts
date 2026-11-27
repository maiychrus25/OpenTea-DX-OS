// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AddTickets, AvailableTickets, CancelBatch, CreateBatch, FinishBatch, GetBatch, ListBatches, RemoveTicket, SetOutputs } from '@/application/processing/BatchUseCases'
import { FakeBatchPort, NOW, actor } from '../../../../__tests__/__mocks__/batch-fakes'

const clock = () => NOW
let port: FakeBatchPort

async function openBatch(day = '2026-11-28') {
  return (await new CreateBatch(port, clock).execute(actor, { processed_on: day, master_name: 'Anh Ba', shift: 'Sáng' })).id
}

beforeEach(() => {
  port = new FakeBatchPort()
  port.addTicket('t1', 95)
  port.addTicket('t2', 95)
  port.addTicket('t3', 237.5)
})

describe('CreateBatch', () => {
  it('numbers batches per day and starts them open and empty', async () => {
    const a = await new CreateBatch(port, clock).execute(actor, { processed_on: '2026-11-28' })
    const b = await new CreateBatch(port, clock).execute(actor, { processed_on: '2026-11-28', master_name: 'Anh Ba' })
    const c = await new CreateBatch(port, clock).execute(actor, { processed_on: '2026-11-27' })
    expect([a.batch_code, b.batch_code, c.batch_code]).toEqual(['TC-MS-20261128-01', 'TC-MS-20261128-02', 'TC-MS-20261127-01'])
    expect(a).toMatchObject({ status: 'OPEN', ticket_count: 0, fresh_kg: 0, dry_kg: 0, recovery_ratio: null })
    expect(b.master_name).toBe('Anh Ba')
  })

  it('refuses a day after today in Vietnam', async () => {
    await expect(new CreateBatch(port, clock).execute(actor, { processed_on: '2026-11-29' })).rejects.toThrow('sau hôm nay')
  })

  it.each(['farmer', 'accountant'])('refuses a %s', async (role) => {
    await expect(new CreateBatch(port, clock).execute({ ...actor, role }, { processed_on: '2026-11-28' })).rejects.toThrow('Forbidden')
  })
})

describe('AddTickets and RemoveTicket', () => {
  it('puts tickets into the batch and shows the live totals', async () => {
    const id = await openBatch()
    const detail = await new AddTickets(port).execute(actor, id, ['t1', 't2', 't3'])
    expect(detail.batch).toMatchObject({ ticket_count: 3, fresh_kg: 427.5 })
    expect(detail.tickets).toHaveLength(3)
    expect(await new AvailableTickets(port, clock).execute(actor, {})).toHaveLength(0)
  })

  it('answers TICKETS_CHANGED and keeps nothing when one ticket is voided, foreign or already batched', async () => {
    const id = await openBatch()
    const other = await openBatch()
    await new AddTickets(port).execute(actor, other, ['t3'])
    port.addTicket('t4', 10, { view: { ...port.tickets[0].view, id: 't4', status: 'VOIDED' } })
    port.addTicket('t5', 10, { htx: 'htx-other' })
    for (const bad of ['t3', 't4', 't5', 'missing']) {
      await expect(new AddTickets(port).execute(actor, id, ['t1', bad])).rejects.toMatchObject({ code: 'TICKETS_CHANGED' })
    }
    expect((await new GetBatch(port).execute(actor, id)).tickets).toHaveLength(0)
  })

  it('refuses a batch that is not open with BATCH_NOT_OPEN', async () => {
    const id = await openBatch()
    await new CancelBatch(port, clock).execute(actor, id, 'Nhập nhầm')
    await expect(new AddTickets(port).execute(actor, id, ['t1'])).rejects.toMatchObject({ code: 'BATCH_NOT_OPEN' })
    await expect(new RemoveTicket(port).execute(actor, id, 't1')).rejects.toMatchObject({ code: 'BATCH_NOT_OPEN' })
    await expect(new SetOutputs(port).execute(actor, id, [{ grade: 'DINH', kg: 5 }])).rejects.toMatchObject({ code: 'BATCH_NOT_OPEN' })
  })

  it('removes a ticket, and answers not found for one that is not in the batch or for another HTX', async () => {
    const id = await openBatch()
    await new AddTickets(port).execute(actor, id, ['t1', 't2'])
    const after = await new RemoveTicket(port).execute(actor, id, 't1')
    expect(after.tickets.map((t) => t.id)).toEqual(['t2'])
    await expect(new RemoveTicket(port).execute(actor, id, 't1')).rejects.toThrow('không nằm trong mẻ')
    await expect(new AddTickets(port).execute({ ...actor, htxProfileId: 'htx-other' }, id, ['t1'])).rejects.toThrow('Không tìm thấy mẻ')
  })
})

describe('SetOutputs', () => {
  it('replaces the whole set', async () => {
    const id = await openBatch()
    await new SetOutputs(port).execute(actor, id, [{ grade: 'DINH', kg: 10 }, { grade: 'BOM', kg: 20 }])
    const detail = await new SetOutputs(port).execute(actor, id, [{ grade: 'TOM_NON', kg: 85.5 }])
    expect(detail.outputs).toMatchObject([{ grade: 'TOM_NON', kg: 85.5, remaining_kg: 85.5 }])
    expect(detail.preview.dry_kg).toBe(85.5)
  })
})

describe('FinishBatch', () => {
  async function ready(dry: number) {
    const id = await openBatch()
    await new AddTickets(port).execute(actor, id, ['t1', 't2', 't3'])
    await new SetOutputs(port).execute(actor, id, [{ grade: 'DINH', kg: dry }])
    return id
  }

  it('finishes in band without a note and freezes the batch', async () => {
    const id = await ready(95)
    const done = await new FinishBatch(port, clock).execute(actor, id, {})
    expect(done.batch).toMatchObject({ status: 'FINISHED', fresh_kg: 427.5, dry_kg: 95, recovery_ratio: 4.5, out_of_band: false, deviation_note: null })
    await expect(new SetOutputs(port).execute(actor, id, [{ grade: 'DINH', kg: 1 }])).rejects.toMatchObject({ code: 'BATCH_NOT_OPEN' })
    await expect(new FinishBatch(port, clock).execute(actor, id, {})).rejects.toMatchObject({ code: 'BATCH_NOT_OPEN' })
  })

  it.each([undefined, '', '   ', 'ngắn quá'])('out of band needs a note of 10 characters (%p)', async (note) => {
    const id = await ready(85.4)
    await expect(new FinishBatch(port, clock).execute(actor, id, { deviation_note: note })).rejects.toMatchObject({ code: 'DEVIATION_NOTE_REQUIRED', details: { recovery_ratio: 5.01 } })
    expect((await new GetBatch(port).execute(actor, id)).batch.status).toBe('OPEN')
  })

  it('finishes out of band with a note and flags it', async () => {
    const id = await ready(85.4)
    const done = await new FinishBatch(port, clock).execute(actor, id, { deviation_note: 'Búp héo do để qua đêm' })
    expect(done.batch).toMatchObject({ status: 'FINISHED', out_of_band: true, recovery_ratio: 5.01, deviation_note: 'Búp héo do để qua đêm' })
  })

  it('answers BATCH_EMPTY without tickets or without outputs', async () => {
    const empty = await openBatch()
    await expect(new FinishBatch(port, clock).execute(actor, empty, {})).rejects.toMatchObject({ code: 'BATCH_EMPTY' })
    const noOutput = await openBatch()
    await new AddTickets(port).execute(actor, noOutput, ['t1'])
    await expect(new FinishBatch(port, clock).execute(actor, noOutput, {})).rejects.toMatchObject({ code: 'BATCH_EMPTY' })
    const noTicket = await openBatch()
    await new SetOutputs(port).execute(actor, noTicket, [{ grade: 'CAM', kg: 5 }])
    await expect(new FinishBatch(port, clock).execute(actor, noTicket, {})).rejects.toMatchObject({ code: 'BATCH_EMPTY' })
  })
})

describe('CancelBatch', () => {
  it('releases every ticket and keeps the reason', async () => {
    const id = await openBatch()
    await new AddTickets(port).execute(actor, id, ['t1', 't2'])
    const view = await new CancelBatch(port, clock).execute(actor, id, 'Mở nhầm ngày')
    expect(view).toMatchObject({ status: 'CANCELLED', cancel_reason: 'Mở nhầm ngày', ticket_count: 0 })
    expect(await new AvailableTickets(port, clock).execute(actor, {})).toHaveLength(3)
  })
})

describe('reads', () => {
  it('lists by status and refuses other roles', async () => {
    const open = await openBatch()
    const done = await openBatch()
    await new CancelBatch(port, clock).execute(actor, done, 'Mở nhầm ngày')
    expect((await new ListBatches(port).execute(actor, { status: 'OPEN' })).map((b) => b.id)).toEqual([open])
    await expect(new ListBatches(port).execute({ ...actor, role: 'farmer' }, {})).rejects.toThrow('Forbidden')
    await expect(new GetBatch(port).execute(actor, 'nope')).rejects.toThrow('Không tìm thấy mẻ')
  })
})
