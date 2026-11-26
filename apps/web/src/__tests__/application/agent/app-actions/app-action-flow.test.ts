/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AgentAppRecord } from '@/application/agent/app-actions/AppActionCatalog'
import { evidenceDigest, canonicalJson, sha256Hex } from '@/domain/agent/evidence'
import type { Proposal } from '@/domain/agent/proposal'
import { DomainError } from '@/domain/errors'

const mockRun = jest.fn()
let mockApps: AgentAppRecord[] = []
const mockExpire = jest.fn(async () => 0)

jest.mock('@/application/agent/app-actions/default-app-actions', () => ({
  appActionCatalog: new (jest.requireActual('@/application/agent/app-actions/AppActionCatalog').AppActionCatalog)(
    { listAgentApps: async () => mockApps, expireOrphaned: () => mockExpire() },
    (call: unknown) => mockRun(call),
    0
  ),
}))

import { CreateProposalUseCase } from '@/application/agent/CreateProposalUseCase'
import { DecideProposalUseCase } from '@/application/agent/DecideProposalUseCase'

const KIND = 'app.tea-shop.promotion.create'
const teaShop: AgentAppRecord = {
  appId: 'tea-shop',
  htxCodes: ['TC'],
  agent: {
    suggestions: '/agent/suggestions',
    actions: [
      {
        name: 'promotion.create',
        title_vi: 'Tạo khuyến mãi',
        risk: 'medium',
        approver_roles: ['manager'],
        money: true,
        path: '/agent/actions/promotion-create',
        payload: {
          type: 'object',
          required: ['product_id', 'discount_pct', 'days'],
          additionalProperties: false,
          properties: {
            product_id: { type: 'string', maxLength: 64 },
            discount_pct: { type: 'integer', minimum: 5, maximum: 30 },
            days: { type: 'integer', minimum: 1, maximum: 14 },
          },
        },
      },
    ],
  },
}
const payload = { product_id: 'p1', discount_pct: 10, days: 7, _labels: { product_name: 'Chè' } }
const row = { table: 'app:tea-shop', id: 'p1', sha256: sha256Hex(canonicalJson(payload)) }
const evidence = { rows: [row], sha256: evidenceDigest([row]) }
const manager = { userId: 'm1', role: 'manager' as const, htxCode: 'TC', htxProfileId: 'h' }

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: '00000000-0000-0000-0000-000000000001', htxCode: 'TC', runId: null, agent: 'app:tea-shop', kind: KIND, payload,
    reasonVi: 'x', evidence, confidence: null, risk: 'medium', status: 'proposed', origin: 'agent', requestedBy: null,
    dedupeKey: 'k', createdAt: new Date('2026-11-27T00:00:00Z'), expiresAt: new Date('2026-12-30T00:00:00Z'),
    decidedBy: null, decidedByName: null, decidedAt: null, decisionChannel: null, decisionNote: null,
    editedPayload: null, executedAt: null, result: null, ...overrides,
  }
}

beforeEach(() => {
  mockApps = [teaShop]
  mockRun.mockReset()
  mockExpire.mockClear()
})

describe('creating an app proposal', () => {
  const repo = { create: jest.fn(async () => ({ id: 'new' })), createdSince: jest.fn(async () => false) }
  const input = { htxCode: 'TC', agent: 'app:tea-shop', kind: KIND, payload, reasonVi: 'Còn 40 gói', evidence, origin: 'agent' as const }

  it('accepts the app evidence row and dedupes on its subjects', async () => {
    await new CreateProposalUseCase(repo).execute(input)
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ kind: KIND, subjects: ['p1'], risk: 'medium' }))
  })

  it('refuses a payload outside the action schema', async () => {
    await expect(new CreateProposalUseCase(repo).execute({ ...input, payload: { ...payload, discount_pct: 99 } })).rejects.toThrow('INVALID_PAYLOAD')
  })

  it('refuses an unknown action, an app disabled for the cooperative, and another app\'s evidence table', async () => {
    await expect(new CreateProposalUseCase(repo).execute({ ...input, kind: 'app.tea-shop.nope' })).rejects.toThrow('UNKNOWN_KIND')
    await expect(new CreateProposalUseCase(repo).execute({ ...input, htxCode: 'OTHER' })).rejects.toThrow('UNKNOWN_KIND')
    const foreign = { table: 'app:other', id: 'p1', sha256: row.sha256 }
    await expect(
      new CreateProposalUseCase(repo).execute({ ...input, evidence: { rows: [foreign], sha256: evidenceDigest([foreign]) } })
    ).rejects.toThrow('INVALID_EVIDENCE_TABLE')
  })
})

describe('deciding an app proposal', () => {
  const makeRepo = (p: Proposal) => ({
    findById: jest.fn(async () => p),
    claim: jest.fn(async () => p),
    markRejected: jest.fn(), markStale: jest.fn(),
    markExpired: jest.fn(async () => true),
    markExecuted: jest.fn(async () => undefined),
    markFailed: jest.fn(async () => undefined),
  })
  const decide = (repo: ReturnType<typeof makeRepo>) =>
    new DecideProposalUseCase(repo).execute({ proposalId: 'x', tenant: manager, userName: 'Quản lý', decision: 'approve', channel: 'telegram' })

  it('runs the app as the approver and records the result', async () => {
    mockRun.mockResolvedValue({ promotion_id: 'pr1' })
    const repo = makeRepo(proposal())
    expect(await decide(repo)).toEqual({ outcome: 'executed', result: { result: { promotion_id: 'pr1' } } })
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ appId: 'tea-shop', approver: manager, body: { product_id: 'p1', discount_pct: 10, days: 7 } }))
  })

  it('marks the proposal failed with the app message when the app refuses', async () => {
    mockRun.mockRejectedValue(new DomainError('Sản phẩm đang có khuyến mãi.'))
    const repo = makeRepo(proposal())
    expect(await decide(repo)).toEqual({ outcome: 'failed', error: 'Sản phẩm đang có khuyến mãi.' })
    expect(repo.markFailed).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001', 'Sản phẩm đang có khuyến mãi.', expect.anything())
  })

  it('answers expired without calling the app once the app is removed (test 16)', async () => {
    mockApps = []
    const repo = makeRepo(proposal())
    expect(await decide(repo)).toEqual({ outcome: 'expired' })
    expect(repo.markExpired).toHaveBeenCalled()
    expect(repo.claim).not.toHaveBeenCalled()
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('answers expired when the app is installed but disabled for this cooperative', async () => {
    mockApps = [{ ...teaShop, htxCodes: ['OTHER'] }]
    const repo = makeRepo(proposal())
    expect(await decide(repo)).toEqual({ outcome: 'expired' })
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('reports an already decided proposal of a removed app as it is', async () => {
    mockApps = []
    const repo = makeRepo(proposal({ status: 'executed', decidedByName: 'A' }))
    expect(await decide(repo)).toMatchObject({ outcome: 'already_decided', status: 'executed' })
    expect(repo.markExpired).not.toHaveBeenCalled()
  })

  it('refuses an officer on a manager-only action', async () => {
    await expect(
      new DecideProposalUseCase(makeRepo(proposal())).execute({ proposalId: 'x', tenant: { ...manager, role: 'officer' }, userName: 'n', decision: 'approve', channel: 'web' })
    ).rejects.toThrow('Bạn không có quyền')
  })
})
