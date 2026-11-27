// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { VoidFreshLeafTicketUseCase } from '@/application/weighing/VoidFreshLeafTicketUseCase'
import { PublishDailyPricesUseCase } from '@/application/weighing/PublishDailyPricesUseCase'
import { ConflictError, ForbiddenError, NotFoundError } from '@/domain/errors'
import type { LeafPricePort } from '@/domain/weighing/ports/LeafPricePort'
import { FakeTicketPort, NOW, actor } from '../../../../__tests__/__mocks__/weighing-fakes'

describe('VoidFreshLeafTicketUseCase', () => {
  const ticket = { id: 't1' } as never
  it('voids a valid ticket with the reason', async () => {
    const port = new FakeTicketPort()
    port.voidOutcome = { kind: 'voided', ticket }
    const spy = jest.spyOn(port, 'voidTicket')
    await expect(new VoidFreshLeafTicketUseCase(port, () => NOW).execute(actor, 't1', 'Cân nhầm hộ')).resolves.toBe(ticket)
    expect(spy).toHaveBeenCalledWith({ htxProfileId: 'htx-tc', id: 't1', reason: 'Cân nhầm hộ', userId: 'acc-1', at: NOW })
  })

  it('a settled ticket answers TICKET_SETTLED', async () => {
    const port = new FakeTicketPort()
    port.voidOutcome = { kind: 'settled' }
    const err = await new VoidFreshLeafTicketUseCase(port).execute(actor, 't1', 'abc').catch((e) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect(err.code).toBe('TICKET_SETTLED')
  })

  it('a voided ticket answers TICKET_VOIDED, a missing one is not found', async () => {
    const port = new FakeTicketPort()
    port.voidOutcome = { kind: 'already_voided' }
    expect((await new VoidFreshLeafTicketUseCase(port).execute(actor, 't1', 'abc').catch((e) => e)).code).toBe('TICKET_VOIDED')
    port.voidOutcome = { kind: 'not_found' }
    await expect(new VoidFreshLeafTicketUseCase(port).execute(actor, 't1', 'abc')).rejects.toBeInstanceOf(NotFoundError)
  })

  it.each(['farmer', 'officer'])('a %s cannot void', async (role) => {
    const port = new FakeTicketPort()
    const spy = jest.spyOn(port, 'voidTicket')
    await expect(new VoidFreshLeafTicketUseCase(port).execute({ ...actor, role }, 't1', 'abc')).rejects.toBeInstanceOf(ForbiddenError)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('PublishDailyPricesUseCase', () => {
  const today = { date: '2026-11-28', published_at: null, prices: [] }
  const port = (ok = true): jest.Mocked<LeafPricePort> => ({
    listGrades: jest.fn(), createGrade: jest.fn(), updateGrade: jest.fn(),
    pricesFor: jest.fn().mockResolvedValue(today),
    upsertPrices: jest.fn().mockResolvedValue(ok),
  })
  const prices = [{ grade_id: 'g-1', price_vnd_per_kg: 15000 }]

  it('upserts for today in Vietnam and returns the day', async () => {
    const p = port()
    await expect(new PublishDailyPricesUseCase(p, () => new Date('2026-11-28T18:00:00Z')).execute({ ...actor, role: 'manager' }, prices)).resolves.toBe(today)
    // 18:00 UTC is already the 29th in Vietnam
    expect(p.upsertPrices).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-11-29', htxProfileId: 'htx-tc', publishedById: 'acc-1', prices }))
    expect(p.pricesFor).toHaveBeenCalledWith('htx-tc', '2026-11-29')
  })

  it('publishing twice is two upserts of the same day', async () => {
    const p = port()
    const useCase = new PublishDailyPricesUseCase(p, () => NOW)
    await useCase.execute({ ...actor, role: 'manager' }, prices)
    await useCase.execute({ ...actor, role: 'manager' }, [{ grade_id: 'g-1', price_vnd_per_kg: 16000 }])
    expect(p.upsertPrices.mock.calls.map((c) => c[0].day)).toEqual(['2026-11-28', '2026-11-28'])
  })

  it('a grade outside the HTX is not found', async () => {
    await expect(new PublishDailyPricesUseCase(port(false)).execute({ ...actor, role: 'manager' }, prices)).rejects.toBeInstanceOf(NotFoundError)
  })

  it.each(['accountant', 'officer', 'farmer'])('a %s cannot publish', async (role) => {
    const p = port()
    await expect(new PublishDailyPricesUseCase(p).execute({ ...actor, role }, prices)).rejects.toBeInstanceOf(ForbiddenError)
    expect(p.upsertPrices).not.toHaveBeenCalled()
  })
})
