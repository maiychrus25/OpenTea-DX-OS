// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import { RecordZaloConsentUseCase } from '@/application/zalo/ZaloConsentUseCases'
import { FakeZaloRepository, seedHousehold } from '../../../../__tests__/__mocks__/zalo-fakes'

const staff = (role: string) => ({ userId: `${role}-1`, role, htxCode: 'TC' })
const farmer = { userId: 'kc-farmer-1', role: 'farmer', htxCode: 'TC' }

function setup() {
  const repo = new FakeZaloRepository()
  seedHousehold(repo, 'hh-1', '0912345678', 'TC', false)
  seedHousehold(repo, 'hh-2', '0987654321', 'TC', false)
  seedHousehold(repo, 'hh-x', '0911111111', 'OTHER', false)
  repo.keycloakIds.set('hh-1', 'kc-farmer-1')
  return { repo, use: new RecordZaloConsentUseCase(repo) }
}

describe('RecordZaloConsentUseCase', () => {
  it.each(['officer', 'manager'])('lets a %s record OPTED_IN and OPTED_OUT for any household of the cooperative, with the phone and recorder', async (role) => {
    const { repo, use } = setup()
    await use.execute(staff(role), 'hh-2', { status: 'OPTED_IN', source: 'OFFICER' })
    await use.execute(staff(role), 'hh-2', { status: 'OPTED_OUT', source: 'REGISTRATION' })
    expect(repo.consents.map((c) => [c.householdId, c.state.status, c.state.source, c.state.phone, c.recordedBy])).toEqual([
      ['hh-2', 'OPTED_IN', 'OFFICER', '84987654321', `${role}-1`],
      ['hh-2', 'OPTED_OUT', 'REGISTRATION', '84987654321', `${role}-1`],
    ])
  })

  it('refuses staff the MEMBER source, an accountant, and a household of another cooperative', async () => {
    const { repo, use } = setup()
    await expect(use.execute(staff('officer'), 'hh-2', { status: 'OPTED_IN', source: 'MEMBER' })).rejects.toBeInstanceOf(ValidationError)
    await expect(use.execute(staff('accountant'), 'hh-2', { status: 'OPTED_IN', source: 'OFFICER' })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(use.execute(staff('manager'), 'hh-x', { status: 'OPTED_IN', source: 'OFFICER' })).rejects.toBeInstanceOf(NotFoundError)
    expect(repo.consents).toHaveLength(0)
  })

  it('lets a farmer record only OPTED_OUT with source MEMBER, for the household linked to their own account', async () => {
    const { repo, use } = setup()
    await use.execute(farmer, 'hh-1', { status: 'OPTED_OUT', source: 'MEMBER' })
    expect(repo.consents[0]).toMatchObject({ householdId: 'hh-1', recordedBy: 'kc-farmer-1', state: { status: 'OPTED_OUT', source: 'MEMBER' } })
  })

  it.each([
    ['opting in', 'hh-1', { status: 'OPTED_IN', source: 'MEMBER' }],
    ['another source', 'hh-1', { status: 'OPTED_OUT', source: 'OFFICER' }],
    ['another household of the cooperative', 'hh-2', { status: 'OPTED_OUT', source: 'MEMBER' }],
    ['a household of another cooperative', 'hh-x', { status: 'OPTED_OUT', source: 'MEMBER' }],
    ['a household that does not exist', 'nope', { status: 'OPTED_OUT', source: 'MEMBER' }],
  ])('answers 403 to a farmer %s', async (_name, id, input) => {
    const { repo, use } = setup()
    await expect(use.execute(farmer, id, input as never)).rejects.toBeInstanceOf(ForbiddenError)
    expect(repo.consents).toHaveLength(0)
  })

  it('refuses a household whose phone is not a valid number', async () => {
    const { repo, use } = setup()
    repo.households[1].phone = '123'
    await expect(use.execute(staff('officer'), 'hh-2', { status: 'OPTED_IN', source: 'OFFICER' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('reads the current consent: staff and the farmer of the household, not another farmer', async () => {
    const { use } = setup()
    expect(await use.current(staff('officer'), 'hh-1')).toEqual({ status: null, source: null, at: null })
    await use.execute(staff('officer'), 'hh-1', { status: 'OPTED_IN', source: 'OFFICER' })
    expect(await use.current(farmer, 'hh-1')).toMatchObject({ status: 'OPTED_IN', source: 'OFFICER' })
    await expect(use.current({ ...farmer, userId: 'kc-other' }, 'hh-1')).rejects.toBeInstanceOf(ForbiddenError)
    await expect(use.current(staff('accountant'), 'hh-1')).rejects.toBeInstanceOf(ForbiddenError)
  })
})
