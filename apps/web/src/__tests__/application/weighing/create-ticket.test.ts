// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CreateFreshLeafTicketUseCase } from '@/application/weighing/CreateFreshLeafTicketUseCase'
import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import { FakeTicketPort, NOW, actor, input, spray } from '../../../../__tests__/__mocks__/weighing-fakes'

let port: FakeTicketPort
let useCase: CreateFreshLeafTicketUseCase
beforeEach(() => {
  port = new FakeTicketPort()
  useCase = new CreateFreshLeafTicketUseCase(port, () => NOW)
})

async function conflict(promise: Promise<unknown>): Promise<ConflictError> {
  const err = await promise.then(() => null, (e) => e)
  expect(err).toBeInstanceOf(ConflictError)
  return err as ConflictError
}

describe('the withdrawal lock', () => {
  it('pending spray blocks weighing', async () => {
    port.sprays = [spray('PENDING_APPROVAL', '2026-11-30T00:00:00Z')]
    const err = await conflict(useCase.execute(actor, input))
    expect(err.code).toBe('PARCEL_IN_WITHDRAWAL')
    expect(err.details).toEqual({ safe_from: '2026-11-30' })
    expect(err.message).toContain('TC-A1')
    expect(err.message).toContain('30/11/2026')
    expect(port.tickets).toHaveLength(0)
  })

  it('an approved spray with a safe date of tomorrow blocks', async () => {
    port.sprays = [spray('APPROVED', '2026-11-29T00:00:00Z')]
    expect((await conflict(useCase.execute(actor, input))).details).toEqual({ safe_from: '2026-11-29' })
  })

  it('a spray waiting for changes blocks', async () => {
    port.sprays = [spray('REQUEST_CHANGES', '2026-12-01T00:00:00Z')]
    await conflict(useCase.execute(actor, input))
  })

  it('weighing on the safe day itself is allowed, to the last minute of the Vietnam day', async () => {
    port.sprays = [spray('APPROVED', '2026-11-28T00:00:00Z')]
    await expect(useCase.execute(actor, input)).resolves.toMatchObject({ created: true })
    port.sprays = [spray('APPROVED', '2026-11-28T16:59:00Z')] // 23:59 on the 28th in Vietnam
    await expect(useCase.execute(actor, input)).resolves.toMatchObject({ created: true })
  })

  it('a safe date at midnight of the next Vietnam day still blocks', async () => {
    port.sprays = [spray('APPROVED', '2026-11-28T17:00:00Z')]
    expect((await conflict(useCase.execute(actor, input))).details).toEqual({ safe_from: '2026-11-29' })
  })

  it('a spray of the previous flush still inside its withdrawal blocks', async () => {
    port.sprays = [spray('APPROVED', '2026-12-02T00:00:00Z', '2026-11-18T00:00:00Z', 'old-cycle')]
    await conflict(useCase.execute(actor, input))
  })

  it('a spray of a legacy entry without a flush blocks', async () => {
    port.sprays = [spray('APPROVED', '2026-12-02T00:00:00Z', '2026-11-18T00:00:00Z', null)]
    await conflict(useCase.execute(actor, input))
  })

  it('a spray written for a future day does not block today', async () => {
    port.sprays = [spray('APPROVED', '2026-12-20T00:00:00Z', '2026-12-06T00:00:00Z')]
    await expect(useCase.execute(actor, input)).resolves.toMatchObject({ created: true })
  })

  it('a spray entered today blocks even when its time is later than now', async () => {
    port.sprays = [spray('PENDING_APPROVAL', '2026-12-12T00:00:00Z', '2026-11-28T00:00:00Z')]
    await conflict(useCase.execute(actor, input))
  })

  it.each(['DRAFT', 'REJECTED'])('a %s spray does not block', async (status) => {
    port.sprays = [spray(status, '2026-12-12T00:00:00Z')]
    await expect(useCase.execute(actor, input)).resolves.toMatchObject({ created: true })
  })

  it('the latest safe date is reported', async () => {
    port.sprays = [spray('APPROVED', '2026-12-01T00:00:00Z'), spray('PENDING_APPROVAL', '2026-12-05T00:00:00Z')]
    expect((await conflict(useCase.execute(actor, input))).details).toEqual({ safe_from: '2026-12-05' })
  })

  it('no extra field in the input can skip the check or move the time', async () => {
    port.sprays = [spray('APPROVED', '2026-12-01T00:00:00Z')]
    const sneaky = { ...input, force: true, skip_withdrawal: true, weighed_at: '2020-01-01T00:00:00Z', as_of: '2020-01-01', at: '2020-01-01' }
    await conflict(useCase.execute(actor, sneaky as never))
    expect(port.tickets).toHaveLength(0)
  })

  it('a manager cannot skip it either', async () => {
    port.sprays = [spray('APPROVED', '2026-12-01T00:00:00Z')]
    await conflict(useCase.execute({ ...actor, role: 'manager' }, input))
  })

  it('checks and writes inside one transaction that locks the parcel first', async () => {
    const spy = jest.spyOn(port, 'inTicketTransaction')
    await useCase.execute(actor, input)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(port.locked).toBe(1)
  })
})

describe('writing a ticket', () => {
  it('copies today\'s price and computes net kg and amount', async () => {
    const { ticket, created } = await useCase.execute(actor, input)
    expect(created).toBe(true)
    expect(ticket).toMatchObject({ ticket_no: 'TC-PC-20261128-001', net_kg: 95, price_vnd_per_kg: 15000, amount_vnd: '1425000', status: 'VALID', cycle_id: 'cycle-1' })
    expect(ticket.weighed_at).toBe(NOW.toISOString())
  })

  it('no price today gives NO_PRICE_TODAY and writes nothing', async () => {
    port.price = null
    expect((await conflict(useCase.execute(actor, input))).code).toBe('NO_PRICE_TODAY')
    expect(port.tickets).toHaveLength(0)
  })

  it('concurrent tickets get consecutive numbers', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => useCase.execute(actor, input)))
    const numbers = results.map((r) => r.ticket.ticket_no)
    expect(new Set(numbers).size).toBe(8)
    expect([...numbers].sort()).toEqual(Array.from({ length: 8 }, (_, i) => `TC-PC-20261128-${String(i + 1).padStart(3, '0')}`))
  })

  it('a client_id replay returns the first ticket', async () => {
    const first = (await useCase.execute(actor, input)).ticket
    const replay = await useCase.execute(actor, { ...input, client_id: first.id })
    expect(replay).toEqual({ ticket: first, created: false })
    expect(port.tickets).toHaveLength(1)
  })

  it('two replays racing past the pre-check return the first ticket', async () => {
    const first = (await useCase.execute(actor, input)).ticket
    const racing = new FakeTicketPort()
    racing.tickets = [first]
    racing.insertFailure = Object.assign(new Error('unique'), { code: 'P2002' })
    const calls = jest.spyOn(racing, 'findByClientId').mockResolvedValueOnce(null).mockResolvedValueOnce(first)
    const result = await new CreateFreshLeafTicketUseCase(racing, () => NOW).execute(actor, { ...input, client_id: 'c-1' })
    expect(result).toEqual({ ticket: first, created: false })
    expect(calls).toHaveBeenCalledTimes(2)
  })

  it.each(['farmer', 'officer'])('a %s cannot create a ticket', async (role) => {
    await expect(useCase.execute({ ...actor, role }, input)).rejects.toBeInstanceOf(ForbiddenError)
    expect(port.locked).toBe(0)
  })

  it('a parcel of another HTX is not found', async () => {
    port.parcel.htx_profile_id = 'htx-lb'
    await expect(useCase.execute(actor, input)).rejects.toBeInstanceOf(NotFoundError)
    expect(port.tickets).toHaveLength(0)
  })

  it('a parcel that is not the household\'s is not found', async () => {
    await expect(useCase.execute(actor, { ...input, household_id: 'hh-other' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('a draft parcel is refused', async () => {
    port.parcel.status = 'DRAFT'
    await expect(useCase.execute(actor, input)).rejects.toBeInstanceOf(DomainError)
  })

  it('a hidden grade is refused and an unknown one is not found', async () => {
    port.grade.active = false
    await expect(useCase.execute(actor, input)).rejects.toBeInstanceOf(ValidationError)
    await expect(useCase.execute(actor, { ...input, grade_id: 'nope' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuses a deduction above 30 before writing', async () => {
    await expect(useCase.execute(actor, { ...input, deduction_pct: 31 })).rejects.toBeInstanceOf(ValidationError)
    expect(port.tickets).toHaveLength(0)
  })
})
