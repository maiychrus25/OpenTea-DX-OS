// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CreateCampaignUseCase, createCampaignSchema } from '@/application/agent/campaign/CreateCampaignUseCase'
import type { CampaignRepository } from '@/domain/agent/ports/CampaignRepository'
import type { Proposal } from '@/domain/agent/proposal'
import { ValidationError } from '@/domain/errors'

function proposal(id: string, kind: string, payload: Record<string, unknown>, status: Proposal['status'] = 'proposed'): Proposal {
  return {
    id,
    htxCode: 'TC',
    runId: null,
    agent: 'journal-review',
    kind,
    payload,
    reasonVi: 'lý do',
    evidence: { rows: [], sha256: 'x' },
    confidence: null,
    risk: 'low',
    status,
    origin: 'agent',
    requestedBy: null,
    dedupeKey: id,
    createdAt: new Date('2026-11-26T01:00:00Z'),
    expiresAt: new Date('2099-12-31T00:00:00Z'),
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    decisionChannel: null,
    decisionNote: null,
    editedPayload: null,
    executedAt: null,
    result: null,
  }
}

const RUN_ID = '0b3c5d7e-1f2a-4b5c-8d9e-0f1a2b3c4d5e'
const PROPOSAL_A = '11111111-1111-4111-8111-111111111111'
const PROPOSAL_B = '22222222-2222-4222-8222-222222222222'

const body = (over: Record<string, unknown> = {}) => ({
  day: '2026-11-27',
  items: [
    { proposal_id: PROPOSAL_A, position: 1 },
    { proposal_id: PROPOSAL_B, position: 2 },
  ],
  dropped: [{ proposal_id: '33333333-3333-4333-8333-333333333333', rule: 'rain' }],
  summary_vi: 'Hôm nay có hai việc.',
  run_id: RUN_ID,
  ...over,
})

function fakes(found: Record<string, Proposal | null>) {
  const campaigns = {
    create: jest.fn().mockResolvedValue({ id: 'camp-1', created: true }),
  } as unknown as jest.Mocked<Pick<CampaignRepository, 'create'>> & CampaignRepository
  const proposals = { findById: jest.fn(async (_htx: string, id: string) => found[id] ?? null) }
  const notify = jest.fn().mockResolvedValue(undefined)
  const runOwned = jest.fn().mockResolvedValue(true)
  const useCase = new CreateCampaignUseCase({ campaigns, proposals, notify, runOwned })
  return { campaigns, proposals, notify, runOwned, useCase }
}

describe('createCampaignSchema (C4 refusals)', () => {
  it('accepts a campaign of positions 1..n', () => {
    expect(createCampaignSchema.safeParse(body()).success).toBe(true)
  })
  it.each([
    ['no items', { items: [] }],
    ['more than 15 items', { items: Array.from({ length: 16 }, (_, i) => ({ proposal_id: PROPOSAL_A, position: i + 1 })) }],
    ['positions not 1..n', { items: [{ proposal_id: PROPOSAL_A, position: 2 }] }],
    ['unknown drop rule', { dropped: [{ proposal_id: PROPOSAL_A, rule: 'other' }] }],
    ['empty summary', { summary_vi: '' }],
    ['summary over 400 characters', { summary_vi: 'a'.repeat(401) }],
    ['bad day', { day: '27/11/2026' }],
  ])('refuses %s', (_name, over) => {
    expect(createCampaignSchema.safeParse(body(over)).success).toBe(false)
  })
})

describe('CreateCampaignUseCase (C4)', () => {
  it('refuses a proposal of another cooperative or one already decided', async () => {
    const { useCase, notify } = fakes({ [PROPOSAL_A]: proposal(PROPOSAL_A, 'notification.internal', {}), [PROPOSAL_B]: null })
    await expect(useCase.execute('TC', createCampaignSchema.parse(body()))).rejects.toThrow(ValidationError)
    expect(notify).not.toHaveBeenCalled()
  })

  it('refuses a proposal that is no longer proposed', async () => {
    const { useCase } = fakes({
      [PROPOSAL_A]: proposal(PROPOSAL_A, 'notification.internal', {}, 'approved'),
      [PROPOSAL_B]: proposal(PROPOSAL_B, 'notification.internal', {}),
    })
    await expect(useCase.execute('TC', createCampaignSchema.parse(body()))).rejects.toThrow('INVALID_CAMPAIGN')
  })

  it('refuses a run that does not belong to the cooperative', async () => {
    const { useCase, runOwned } = fakes({})
    runOwned.mockResolvedValue(false)
    await expect(useCase.execute('TC', createCampaignSchema.parse(body()))).rejects.toThrow('INVALID_RUN_ID')
  })

  it('recomputes goal keys and targets from the proposals, never from the agent', async () => {
    const { useCase, campaigns } = fakes({
      [PROPOSAL_A]: proposal(PROPOSAL_A, 'journal.approve', { entry_ids: ['e1', 'e2'] }),
      [PROPOSAL_B]: proposal(PROPOSAL_B, 'journal.approve', { entry_ids: ['e3'] }),
    })
    await useCase.execute('TC', createCampaignSchema.parse(body()))
    const input = campaigns.create.mock.calls[0][0]
    expect(input.items).toEqual([
      { proposalId: PROPOSAL_A, position: 1, goalKey: 'journal_backlog', target: 2 },
      { proposalId: PROPOSAL_B, position: 2, goalKey: 'journal_backlog', target: 1 },
    ])
    expect(input.goals).toEqual([{ goalKey: 'journal_backlog', labelVi: 'Duyệt nhật ký tồn', unitVi: 'nhật ký', target: 3 }])
  })

  it('queues the Telegram message once for a new campaign', async () => {
    const { useCase, notify } = fakes({
      [PROPOSAL_A]: proposal(PROPOSAL_A, 'notification.internal', {}),
      [PROPOSAL_B]: proposal(PROPOSAL_B, 'harvest.approve', { parcel_id: 'p' }),
    })
    const result = await useCase.execute('TC', createCampaignSchema.parse(body()))
    expect(result).toEqual({ created: true, id: 'camp-1' })
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith('TC', 'camp-1')
  })

  it('second campaign of the day returns the first and does nothing else', async () => {
    const { useCase, campaigns, notify } = fakes({
      [PROPOSAL_A]: proposal(PROPOSAL_A, 'notification.internal', {}),
      [PROPOSAL_B]: proposal(PROPOSAL_B, 'harvest.approve', { parcel_id: 'p' }),
    })
    campaigns.create.mockResolvedValue({ id: 'camp-first', created: false })
    const result = await useCase.execute('TC', createCampaignSchema.parse(body()))
    expect(result).toEqual({ created: false, id: 'camp-first' })
    expect(notify).not.toHaveBeenCalled()
  })
})
