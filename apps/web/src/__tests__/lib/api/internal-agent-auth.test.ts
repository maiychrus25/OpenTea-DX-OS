/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForbiddenError, UnauthorizedError } from '@/domain/errors'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'

describe('requireAgentCaller', () => {
  const prevSecret = process.env.DXOS_INTERNAL_GATEWAY_SECRET

  afterEach(() => {
    if (prevSecret === undefined) {
      delete process.env.DXOS_INTERNAL_GATEWAY_SECRET
    } else {
      process.env.DXOS_INTERNAL_GATEWAY_SECRET = prevSecret
    }
  })

  test('fails closed with ForbiddenError when DXOS_INTERNAL_GATEWAY_SECRET is unset', async () => {
    delete process.env.DXOS_INTERNAL_GATEWAY_SECRET
    const verify = jest.fn()
    const req = new Request('http://web/api/internal/agent/runs', {
      method: 'POST',
      headers: { 'x-dxos-gateway': 'anything', authorization: 'Bearer tok' },
    })
    await expect(requireAgentCaller(req, { verify })).rejects.toThrow(
      new ForbiddenError('INTERNAL_GATEWAY_REQUIRED')
    )
    expect(verify).not.toHaveBeenCalled()
  })

  test('rejects missing or mismatched X-Dxos-Gateway header', async () => {
    process.env.DXOS_INTERNAL_GATEWAY_SECRET = 'top-secret'
    const verify = jest.fn()

    await expect(
      requireAgentCaller(
        new Request('http://web/api/internal/agent/runs', {
          method: 'POST',
          headers: { authorization: 'Bearer tok' },
        }),
        { verify }
      )
    ).rejects.toThrow(new ForbiddenError('INTERNAL_GATEWAY_REQUIRED'))

    await expect(
      requireAgentCaller(
        new Request('http://web/api/internal/agent/runs', {
          method: 'POST',
          headers: { 'x-dxos-gateway': 'wrong', authorization: 'Bearer tok' },
        }),
        { verify }
      )
    ).rejects.toThrow(new ForbiddenError('INTERNAL_GATEWAY_REQUIRED'))
    expect(verify).not.toHaveBeenCalled()
  })

  test('rejects missing bearer token with UnauthorizedError and forwards valid token to verifier', async () => {
    process.env.DXOS_INTERNAL_GATEWAY_SECRET = 'top-secret'
    const verify = jest.fn().mockResolvedValue({
      sub: 'sa-1',
      azp: 'dxos-agent-tc',
      htxCode: 'TC',
      roles: ['agent'],
    })

    await expect(
      requireAgentCaller(
        new Request('http://web/api/internal/agent/runs', {
          method: 'POST',
          headers: { 'x-dxos-gateway': 'top-secret' },
        }),
        { verify }
      )
    ).rejects.toThrow(UnauthorizedError)

    const caller = await requireAgentCaller(
      new Request('http://web/api/internal/agent/runs', {
        method: 'POST',
        headers: { 'x-dxos-gateway': 'top-secret', authorization: 'Bearer jwt-token-here' },
      }),
      { verify }
    )
    expect(verify).toHaveBeenCalledWith('jwt-token-here')
    expect(caller.htxCode).toBe('TC')
  })
})
