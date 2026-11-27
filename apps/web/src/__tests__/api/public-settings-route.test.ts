/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { requireTenant } from '@/lib/api/tenant'
import * as route from '@/app/api/htx/public-settings/route'

const repo = { getPublicSettings: jest.fn(), setPublicShowNames: jest.fn() }
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaPublicSettingsRepository', () => ({ PrismaPublicSettingsRepository: jest.fn(() => repo) }))

const signIn = (role: string) => (requireTenant as jest.Mock).mockResolvedValue({ userId: `${role}-1`, role, htxCode: 'TC', htxProfileId: 'htx-tc' })
const put = (data: unknown) => new Request('http://x', { method: 'PUT', body: JSON.stringify(data) })

beforeEach(() => {
  jest.clearAllMocks()
  repo.getPublicSettings.mockResolvedValue({ public_show_names: false })
  repo.setPublicShowNames.mockImplementation(async (_h: string, _u: string, v: boolean) => ({ public_show_names: v }))
})

describe('/api/htx/public-settings', () => {
  it('lets manager and officer read the setting (default off)', async () => {
    for (const role of ['manager', 'officer']) {
      signIn(role)
      const res = await route.GET(new Request('http://x'), {})
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ data: { public_show_names: false } })
    }
    expect(repo.getPublicSettings).toHaveBeenCalledWith('htx-tc')
  })

  it('refuses farmer and accountant on GET and PUT', async () => {
    for (const role of ['farmer', 'accountant']) {
      signIn(role)
      expect((await route.GET(new Request('http://x'), {})).status).toBe(403)
      expect((await route.PUT(put({ public_show_names: true }), {})).status).toBe(403)
    }
    expect(repo.setPublicShowNames).not.toHaveBeenCalled()
  })

  it('lets only the manager change it, naming the actor', async () => {
    signIn('officer')
    expect((await route.PUT(put({ public_show_names: true }), {})).status).toBe(403)
    signIn('manager')
    const res = await route.PUT(put({ public_show_names: true }), {})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { public_show_names: true } })
    expect(repo.setPublicShowNames).toHaveBeenCalledWith('htx-tc', 'manager-1', true)
  })

  it('answers 400 for a non-boolean, a missing field or an extra field', async () => {
    signIn('manager')
    for (const body of [{ public_show_names: 'yes' }, {}, { public_show_names: true, extra: 1 }]) {
      expect((await route.PUT(put(body), {})).status).toBe(400)
    }
    expect(repo.setPublicShowNames).not.toHaveBeenCalled()
  })
})
