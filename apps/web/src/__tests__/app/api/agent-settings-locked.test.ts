/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GET, PUT } from '@/app/api/agent/settings/route'
import { requireTenant } from '@/lib/api/tenant'

const saveMock = jest.fn()
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/infrastructure/db/agent/PrismaAgentSettingsRepository', () => ({
  PrismaAgentSettingsRepository: jest.fn(() => ({
    load: jest.fn(async () => ({ agents: {}, monthlyLimit: null })),
    availableProviders: jest.fn(async () => ['ollama']),
    save: saveMock,
  })),
}))
jest.mock('@/application/agent/agent-budget', () => ({
  readMonthlyBudget: jest.fn(async () => ({ month: '2026-11', limit: null, spent: 0, level: 'none' })),
}))

const tenant = (role: string) => (requireTenant as jest.Mock).mockResolvedValue({ userId: 'u1', role, htxCode: 'TC', htxProfileId: 'p1' })

describe('AI settings are set by the platform admin (S2)', () => {
  test.each(['manager', 'officer', 'farmer', 'accountant'])('PUT answers 403 with the platform message for %s', async (role) => {
    tenant(role)
    const response = await PUT(new Request('http://web/api/agent/settings', { method: 'PUT', body: '{}' }), {})
    expect(response.status).toBe(403)
    expect((await response.json()).error.message).toBe('Cấu hình AI do quản trị nền tảng đặt.')
    expect(saveMock).not.toHaveBeenCalled()
  })

  test.each(['manager', 'officer'])('GET still serves %s and can_edit is false', async (role) => {
    tenant(role)
    const response = await GET(new Request('http://web/api/agent/settings'), {})
    expect(response.status).toBe(200)
    expect((await response.json()).data.can_edit).toBe(false)
  })
})
