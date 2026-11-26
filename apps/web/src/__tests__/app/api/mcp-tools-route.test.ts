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

const mockCreate = jest.fn()
const mockNotify = jest.fn()
jest.mock('@/infrastructure/db/agent/PrismaProposalRepository', () => ({
  PrismaProposalRepository: jest.fn().mockImplementation(() => ({
    create: (input: unknown) => mockCreate(input),
    createdSince: async () => false,
  })),
}))
jest.mock('@/application/telegram/telegram-services', () => ({
  notifyProposalCreated: (htxCode: string, proposalId: string) => mockNotify(htxCode, proposalId),
}))
const mockParcelLoader = jest.fn()
jest.mock('@/application/agent/actions/journal-evidence', () => {
  const actual = jest.requireActual('@/application/agent/actions/journal-evidence')
  return {
    ...actual,
    EVIDENCE_LOADERS: {
      ...actual.EVIDENCE_LOADERS,
      parcels: (htxCode: string, id: string) => mockParcelLoader(htxCode, id),
    },
  }
})
const mockHarvestUseCase = jest.fn()
jest.mock('@/application/farm/approve-harvest-usecase', () => ({
  ApproveHarvestUseCase: jest.fn().mockImplementation(() => ({ execute: (...args: unknown[]) => mockHarvestUseCase(...args) })),
}))

import { UnauthorizedError } from '@/domain/errors'
import { CHAT_TOOLS } from '@/application/telegram/chat/tools'
import { GET as listToolsRoute } from '@/app/api/mcp/tools/route'
import { POST as callTool } from '@/app/api/mcp/tools/[name]/route'

const listTools = (req: Request) => listToolsRoute(req, {})

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

describe('create_proposal', () => {
  const internalPayload = {
    template: 'sensor_silent',
    slots: { parcel_code: 'P-01', sensor: 'soil_moisture', hours: 12 },
    subjects: ['parcel-1'],
  }

  function create(kind: string, payload: unknown, reason = 'Nhắc các hộ gia đình kiểm tra cảm biến') {
    return callTool(request('POST', { arguments: { kind, payload, reason_vi: reason } }), callContext('create_proposal'))
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockVerify.mockResolvedValue({ sub: 'user-1', azp: 'dxos-mcp', roles: ['manager'] })
    mockRead.mockResolvedValue(LIVE_MANAGER)
    mockCreate.mockResolvedValue({ id: 'proposal-1' })
    mockNotify.mockResolvedValue(undefined)
    mockParcelLoader.mockImplementation(async (htxCode: string, id: string) =>
      htxCode === 'TC' && id === 'parcel-1' ? { id, parcel_code: 'P-01' } : null
    )
  })

  it('creates a user proposal for a manager, queues it to Telegram and answers 201 without executing', async () => {
    const res = await create('notification.internal', internalPayload)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      proposal_id: 'proposal-1',
      status: 'proposed',
      message_vi: 'Đã tạo đề xuất. Bạn cần xác nhận trên web hoặc Telegram.',
    })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        htxCode: 'TC',
        kind: 'notification.internal',
        origin: 'user',
        requestedBy: 'user-1',
        agent: 'mcp',
        channel: 'mcp',
      })
    )
    expect(mockNotify).toHaveBeenCalledWith('TC', 'proposal-1')
    expect(mockHarvestUseCase).not.toHaveBeenCalled()
  })

  it('builds the evidence on the server from the payload subjects', async () => {
    const res = await create('harvest.approve', { parcel_id: 'parcel-1' })
    expect(res.status).toBe(201)
    const input = mockCreate.mock.calls[0][0]
    expect(input.evidence.rows).toEqual([
      expect.objectContaining({ table: 'parcels', id: 'parcel-1', values: { id: 'parcel-1', parcel_code: 'P-01' } }),
    ])
    expect(mockHarvestUseCase).not.toHaveBeenCalled()
  })

  it('refuses a kind the person cannot decide with 403 NOT_AN_APPROVER', async () => {
    mockVerify.mockResolvedValue({ sub: 'officer-1', azp: 'dxos-mcp', roles: ['officer'] })
    mockRead.mockResolvedValue({ roles: ['officer'], enabled: true, htxCode: 'TC' })
    const res = await create('harvest.approve', { parcel_id: 'parcel-1' })
    expect(res.status).toBe(403)
    expect((await res.json()).error.message).toBe('NOT_AN_APPROVER')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('refuses a kind that is not open to user proposals with 400', async () => {
    const res = await create('improvement.adopt', { improvement_id: 'x' })
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('INVALID_ORIGIN')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('refuses an unknown kind with 400', async () => {
    const res = await create('no.such.kind', {})
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('UNKNOWN_KIND')
  })

  it('refuses a subject outside the cooperative with 400 EVIDENCE_NOT_IN_HTX', async () => {
    const res = await create('harvest.approve', { parcel_id: 'parcel-of-another-htx' })
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('EVIDENCE_NOT_IN_HTX')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('refuses a payload that does not match the kind schema with 400 INVALID_PAYLOAD', async () => {
    const res = await create('notification.internal', { ...internalPayload, extra: true })
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('INVALID_PAYLOAD')
  })

  it('answers 409 when an open proposal with the same subjects already exists', async () => {
    mockCreate.mockResolvedValue(null)
    const res = await create('notification.internal', internalPayload)
    expect(res.status).toBe(409)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('refuses arguments without a reason with 400', async () => {
    const res = await callTool(
      request('POST', { arguments: { kind: 'notification.internal', payload: internalPayload } }),
      callContext('create_proposal')
    )
    expect(res.status).toBe(400)
  })

  it('refuses a reason longer than 500 characters with 400', async () => {
    const res = await create('notification.internal', internalPayload, 'x'.repeat(501))
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('answers 401 without a bearer token and creates nothing', async () => {
    const res = await callTool(
      request('POST', { arguments: { kind: 'notification.internal', payload: internalPayload, reason_vi: 'Nhắc' } }, null),
      callContext('create_proposal')
    )
    expect(res.status).toBe(401)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('tool call edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockVerify.mockResolvedValue({ sub: 'user-1', azp: 'dxos-mcp', roles: ['manager'] })
    mockRead.mockResolvedValue(LIVE_MANAGER)
  })

  it('answers 400 to a call whose body is not JSON', async () => {
    const res = await callTool(new Request('https://dxos.test/api/mcp/tools/lots', {
      method: 'POST',
      headers: { authorization: 'Bearer token-a', 'content-type': 'application/json' },
      body: '{not json',
    }), callContext('lots'))
    expect(res.status).toBe(400)
  })

  it('answers 404 for a tool name that does not exist', async () => {
    const res = await callTool(request('POST', { arguments: {} }), callContext('no_such_tool'))
    expect(res.status).toBe(404)
  })
})
