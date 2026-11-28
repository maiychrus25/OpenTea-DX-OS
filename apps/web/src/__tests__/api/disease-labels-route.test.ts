/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { requireTenant } from '@/lib/api/tenant'
import * as route from '@/app/api/disease-labels/route'

const repo = { list: jest.fn() }
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaDiseaseLabelRepository', () => ({ PrismaDiseaseLabelRepository: jest.fn(() => repo) }))

const signIn = (role: string) => (requireTenant as jest.Mock).mockResolvedValue({ userId: `${role}-1`, role, htxCode: 'TC', htxProfileId: 'htx-tc' })
const labels = [{ code: 'helopeltis', name_vi: 'Bọ xít muỗi', scientific_name: 'Helopeltis theivora', group: 'PEST', is_target: true, sort_order: 50 }]

beforeEach(() => {
  jest.clearAllMocks()
  repo.list.mockResolvedValue(labels)
})

describe('GET /api/disease-labels', () => {
  it('lets officer and manager read the list, wrapped in data', async () => {
    for (const role of ['officer', 'manager']) {
      signIn(role)
      const res = await route.GET(new Request('http://x'), {})
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ data: labels })
    }
  })

  it('refuses farmer and accountant', async () => {
    for (const role of ['farmer', 'accountant']) {
      signIn(role)
      expect((await route.GET(new Request('http://x'), {})).status).toBe(403)
    }
    expect(repo.list).not.toHaveBeenCalled()
  })
})
