// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CreateLotFromBatchesUseCase } from '@/application/processing/CreateLotFromBatchesUseCase'
import { DryStockUseCase } from '@/application/processing/DryStockUseCase'
import { FakeLotBatchPort, lotActor, sprayOf } from '../../../../__tests__/__mocks__/lot-batch-fakes'

let port: FakeLotBatchPort
const make = () => new CreateLotFromBatchesUseCase(port)

beforeEach(() => {
  port = new FakeLotBatchPort()
  port.addOutput('o1', 'DINH', 20)
  port.addOutput('o2', 'DINH', 30)
  port.addOutput('o3', 'BOM', 10)
})

describe('CreateLotFromBatchesUseCase', () => {
  it('makes a lot from the kg taken, with the grade, the latest weigh day and one line per parcel', async () => {
    port.tickets.o2 = [{ id: 't-late', parcel_id: 'p-1', parcel_code: 'TC-A1', cycle_id: 'cycle-2', weighed_at: new Date('2026-11-28T03:00:00Z'), net_kg: '50.0' }, { id: 't-b', parcel_id: 'p-2', parcel_code: 'TC-A2', cycle_id: null, weighed_at: new Date('2026-11-26T03:00:00Z'), net_kg: '50.0' }]
    const lot = await make().execute(lotActor, { grade: 'DINH', sources: [{ output_id: 'o1', kg: 12.5 }, { output_id: 'o2', kg: 30 }], destination: 'Hà Nội' })
    expect(lot).toMatchObject({ lot_code: 'TC-CHE-20261128-001', dry_grade: 'DINH', estimated_weight_kg: 42.5, status: 'READY', parcel_count: 2 })
    expect(port.lots[0]).toMatchObject({ gradeLabel: 'Đinh', harvestDay: '2026-11-28', destination: 'Hà Nội', packagingType: null })
    expect(port.lots[0].parcelLines).toEqual(expect.arrayContaining([{ parcel_id: 'p-1', cycle_id: 'cycle-2' }, { parcel_id: 'p-2', cycle_id: null }]))
    expect((await port.stock('htx-tc', 'DINH')).map((r) => [r.output_id, r.remaining_kg])).toEqual([['o1', 7.5]])
  })

  it('answers STOCK_CHANGED with the fresh stock when a row has less left, and takes nothing', async () => {
    await make().execute(lotActor, { grade: 'DINH', sources: [{ output_id: 'o1', kg: 15 }] })
    const err = await make().execute(lotActor, { grade: 'DINH', sources: [{ output_id: 'o1', kg: 5.1 }] }).catch((e) => e)
    expect(err).toMatchObject({ code: 'STOCK_CHANGED' })
    expect(err.details.stock.map((r: { output_id: string; remaining_kg: number }) => [r.output_id, r.remaining_kg])).toEqual([['o1', 5], ['o2', 30]])
    expect(port.lots).toHaveLength(1)
  })

  it('lets exactly the remaining kg through and the next draw gets STOCK_CHANGED (no negative stock)', async () => {
    await make().execute(lotActor, { grade: 'DINH', sources: [{ output_id: 'o1', kg: 20 }] })
    await expect(make().execute(lotActor, { grade: 'DINH', sources: [{ output_id: 'o1', kg: 0.1 }] })).rejects.toMatchObject({ code: 'STOCK_CHANGED' })
    expect(port.outputs[0].taken_kg).toBe(20)
  })

  it('answers STOCK_CHANGED for a row that is not finished, foreign or missing', async () => {
    port.addOutput('open', 'DINH', 9, { batch_status: 'OPEN' })
    port.addOutput('foreign', 'DINH', 9, { htx_profile_id: 'htx-other' })
    for (const id of ['open', 'foreign', 'missing']) {
      await expect(make().execute(lotActor, { grade: 'DINH', sources: [{ output_id: 'o1', kg: 1 }, { output_id: id, kg: 1 }] })).rejects.toMatchObject({ code: 'STOCK_CHANGED' })
    }
    expect(port.lots).toHaveLength(0)
  })

  it('answers GRADE_MISMATCH for a row of another grade', async () => {
    await expect(make().execute(lotActor, { grade: 'DINH', sources: [{ output_id: 'o1', kg: 1 }, { output_id: 'o3', kg: 1 }] })).rejects.toMatchObject({ code: 'GRADE_MISMATCH' })
    expect(port.lots).toHaveLength(0)
  })

  it('refuses a spraying back-dated after the ticket was weighed, naming parcel, weigh day and safe day (Review Focus 3)', async () => {
    // Weighed on 27/11; a spraying dated 26/11 was entered afterwards and is safe only from 02/12.
    port.sprays['p-1'] = [sprayOf('2026-11-26', '2026-12-02T00:00:00+07:00', 'cycle-9')]
    const err = await make().execute(lotActor, { grade: 'DINH', sources: [{ output_id: 'o1', kg: 5 }] }).catch((e) => e)
    expect(err).toMatchObject({ code: 'WITHDRAWAL_NOT_PASSED', details: { parcel_code: 'TC-A1', weighed_on: '2026-11-27', safe_on: '2026-12-02' } })
    expect(err.message).toBe('Thửa TC-A1 có phiếu cân ngày 27/11/2026 chưa qua thời gian cách ly. An toàn thu hoạch từ ngày 02/12/2026.')
    expect(port.lots).toHaveLength(0)
  })

  it.each(['farmer', 'accountant'])('refuses a %s', async (role) => {
    await expect(make().execute({ ...lotActor, role }, { grade: 'DINH', sources: [{ output_id: 'o1', kg: 1 }] })).rejects.toThrow('Forbidden')
  })
})

describe('DryStockUseCase', () => {
  it('lists stock above zero, by grade, and refuses other roles', async () => {
    await new CreateLotFromBatchesUseCase(port).execute(lotActor, { grade: 'DINH', sources: [{ output_id: 'o1', kg: 20 }] })
    expect((await new DryStockUseCase(port).execute(lotActor)).map((r) => r.output_id)).toEqual(['o2', 'o3'])
    expect((await new DryStockUseCase(port).execute(lotActor, 'BOM')).map((r) => r.output_id)).toEqual(['o3'])
    await expect(new DryStockUseCase(port).execute({ ...lotActor, role: 'accountant' })).rejects.toThrow('Forbidden')
  })
})
