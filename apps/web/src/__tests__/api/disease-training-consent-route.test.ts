/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { requireTenant } from '@/lib/api/tenant'
import * as route from '@/app/api/htx/disease-training-consent/route'

const repo = { get: jest.fn(), set: jest.fn() }
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaDiseaseConsentRepository', () => ({ PrismaDiseaseConsentRepository: jest.fn(() => repo) }))

const signIn = (role: string) => (requireTenant as jest.Mock).mockResolvedValue({ userId: `${role}-1`, role, htxCode: 'TC', htxProfileId: 'htx-tc' })
const put = (data: unknown) => new Request('http://x', { method: 'PUT', body: JSON.stringify(data) })
const off = { enabled: false, at: null, by: null }

beforeEach(() => {
  jest.clearAllMocks()
  repo.get.mockResolvedValue(off)
  repo.set.mockImplementation(async (_h: string, user: string, enabled: boolean) => ({ enabled, at: '2026-11-28T10:00:00.000Z', by: user }))
})

describe('/api/htx/disease-training-consent', () => {
  it('lets only the manager read: off by default', async () => {
    signIn('manager')
    const res = await route.GET(new Request('http://x'), {})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: off })
    expect(repo.get).toHaveBeenCalledWith('htx-tc')
    for (const role of ['officer', 'farmer', 'accountant']) {
      signIn(role)
      expect((await route.GET(new Request('http://x'), {})).status).toBe(403)
    }
  })

  it('lets only the manager switch it, naming the actor, and returns the new state', async () => {
    for (const role of ['officer', 'farmer', 'accountant']) {
      signIn(role)
      expect((await route.PUT(put({ enabled: true }), {})).status).toBe(403)
    }
    expect(repo.set).not.toHaveBeenCalled()
    signIn('manager')
    const res = await route.PUT(put({ enabled: true }), {})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { enabled: true, at: '2026-11-28T10:00:00.000Z', by: 'manager-1' } })
    expect(repo.set).toHaveBeenCalledWith('htx-tc', 'manager-1', true)
  })

  it('answers 400 for a non-boolean, a missing field or an extra field', async () => {
    signIn('manager')
    for (const body of [{ enabled: 'yes' }, {}, { enabled: true, extra: 1 }]) {
      expect((await route.PUT(put(body), {})).status).toBe(400)
    }
    expect(repo.set).not.toHaveBeenCalled()
  })
})
