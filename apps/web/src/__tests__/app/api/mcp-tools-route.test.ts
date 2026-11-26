/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Lesson 6: the MCP routes run without a browser session, so the session and core-token helpers must never be reached.
jest.mock('@/auth', () => ({
  auth: () => {
    throw new Error('session helper used on an MCP route')
  },
}))
jest.mock('@/lib/auth/core-token', () => ({
  getCoreToken: () => {
    throw new Error('core token used on an MCP route')
  },
}))

const mockVerify = jest.fn()
jest.mock('@/infrastructure/auth/agent-token-verifier', () => ({
  KeycloakMcpTokenVerifier: jest.fn().mockImplementation(() => ({ verify: (token: string) => mockVerify(token) })),
}))

const mockRead = jest.fn()
jest.mock('@/infrastructure/auth/dxos-web-roles.client', () => ({
  KeycloakLiveRoleReader: jest.fn().mockImplementation(() => ({ read: (id: string) => mockRead(id) })),
}))
jest.mock('@/infrastructure/db/farm/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn().mockImplementation(() => ({ findByCode: async () => ({ id: 'htx-profile-1' }) })),
}))
jest.mock('@/application/farm/GetFarmerHouseholdUseCase', () => ({
  GetFarmerHouseholdUseCase: jest.fn().mockImplementation(() => ({ execute: async () => ({ id: 'household-1' }) })),
}))
const mockFindAll = jest.fn()
jest.mock('@/infrastructure/db/lot/PrismaLotRepository', () => ({
  PrismaLotRepository: jest.fn().mockImplementation(() => ({ findAll: (filter: unknown) => mockFindAll(filter) })),
}))

import { UnauthorizedError } from '@/domain/errors'
import { CHAT_TOOLS } from '@/application/telegram/chat/tools'
import { GET as listTools } from '@/app/api/mcp/tools/route'
import { POST as callTool } from '@/app/api/mcp/tools/[name]/route'

const LIVE_MANAGER = { roles: ['manager'], enabled: true, htxCode: 'TC' }
const LIVE_FARMER = { roles: ['farmer'], enabled: true, htxCode: 'TC' }

function request(method: 'GET' | 'POST', body?: unknown, bearer: string | null = 'token-a') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (bearer !== null) headers.authorization = `Bearer ${bearer}`
  return new Request('https://dxos.test/api/mcp/tools', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function callContext(name: string) {
  return { params: Promise.resolve({ name }) }
}

describe('MCP tool routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockVerify.mockResolvedValue({ sub: 'user-1', azp: 'dxos-mcp', roles: ['manager'] })
    mockRead.mockResolvedValue(LIVE_MANAGER)
  })

  it('answers 401 without a bearer token', async () => {
    const res = await listTools(request('GET', undefined, null))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('UNAUTHORIZED')
  })

  it('answers 401 when the verifier refuses the token (expired or another client)', async () => {
    mockVerify.mockRejectedValue(new UnauthorizedError('Token expired'))
    const res = await listTools(request('GET'))
    expect(res.status).toBe(401)
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('answers 403 for a disabled user, read live from the identity provider', async () => {
    mockRead.mockResolvedValue({ ...LIVE_MANAGER, enabled: false })
    const res = await listTools(request('GET'))
    expect(res.status).toBe(403)
  })

  it('answers 403 for a user whose role was removed after login', async () => {
    mockRead.mockResolvedValue({ roles: [], enabled: true, htxCode: 'TC' })
    const res = await listTools(request('GET'))
    expect(res.status).toBe(403)
  })

  it('gives a farmer only the farmer read tools and no proposal tool', async () => {
    mockVerify.mockResolvedValue({ sub: 'farmer-1', azp: 'dxos-mcp', roles: ['farmer'] })
    mockRead.mockResolvedValue(LIVE_FARMER)
    const res = await listTools(request('GET'))
    expect(res.status).toBe(200)
    const { tools } = await res.json()
    const expected = CHAT_TOOLS.filter((tool) => tool.roles.includes('farmer')).map((tool) => tool.name)
    expect(tools.map((tool: { name: string }) => tool.name)).toEqual(expected)
  })

  it('refuses a read tool the role may not use, without running it', async () => {
    mockFindAll.mockResolvedValue([])
    const allowed = await callTool(request('POST', { arguments: {} }), callContext('lots'))
    expect(allowed.status).toBe(200)
    mockVerify.mockResolvedValue({ sub: 'farmer-1', azp: 'dxos-mcp', roles: ['farmer'] })
    mockRead.mockResolvedValue(LIVE_FARMER)
    const denied = await callTool(request('POST', { arguments: {} }), callContext('lots'))
    expect(denied.status).toBe(403)
    expect(mockFindAll).toHaveBeenCalledTimes(1)
  })

  it('runs a read tool for an allowed role and answers the engine text with its source', async () => {
    mockFindAll.mockResolvedValue([
      { lot_code: 'TC-CHE-1', commodity: 'Chè', status: 'READY', harvest_date: new Date('2026-11-01T00:00:00Z') },
    ])
    const res = await callTool(request('POST', { arguments: {} }), callContext('lots'))
    expect(res.status).toBe(200)
    const { text } = await res.json()
    expect(text).toContain('TC-CHE-1')
    expect(text).toMatch(/\nNguồn: /)
  })
})
