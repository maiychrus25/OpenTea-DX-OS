/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { POST } from '@/app/api/internal/autopilot/tick/route'
import { ForbiddenError } from '@/domain/errors'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'

const executeMock = jest.fn()

jest.mock('@/lib/api/internal-agent-auth', () => ({ requireAgentCaller: jest.fn() }))
jest.mock('@/application/telegram/telegram-services', () => ({
  autopilotTickUseCase: jest.fn(() => ({ execute: executeMock })),
}))

describe('POST /api/internal/autopilot/tick', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requireAgentCaller as jest.Mock).mockResolvedValue({ sub: 'sa-tc', azp: 'dxos-agent-tc', htxCode: 'TC', roles: ['agent'] })
  })

  test('runs the tick for the cooperative of the agent token only and answers {data}', async () => {
    executeMock.mockResolvedValueOnce({ ran: 2, failed: 0, returned: 1, stopped: null })
    const res = await POST(new Request('http://web/api/internal/autopilot/tick', { method: 'POST', body: JSON.stringify({ htx_code: 'LB' }) }), undefined)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { ran: 2, failed: 0, returned: 1, stopped: null } })
    expect(executeMock).toHaveBeenCalledWith('TC')
  })

  test('answers the stop reason when the mode stopped', async () => {
    executeMock.mockResolvedValueOnce({ ran: 0, failed: 0, returned: 3, stopped: 'brake_cap' })
    const res = await POST(new Request('http://web/api/internal/autopilot/tick', { method: 'POST' }), undefined)
    expect((await res.json()).data).toMatchObject({ stopped: 'brake_cap', returned: 3 })
  })

  test('a caller without a valid agent token runs nothing', async () => {
    ;(requireAgentCaller as jest.Mock).mockRejectedValueOnce(new ForbiddenError('Forbidden'))
    const res = await POST(new Request('http://web/api/internal/autopilot/tick', { method: 'POST' }), undefined)
    expect(res.status).toBe(403)
    expect(executeMock).not.toHaveBeenCalled()
  })
})
