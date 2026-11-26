// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CampaignCandidatesUseCase, type CandidateSource } from '@/application/agent/campaign/CampaignCandidatesUseCase'
import type { Proposal } from '@/domain/agent/proposal'

function proposal(id: string, kind: string, payload: Record<string, unknown>, createdAt: string): Proposal {
  return {
    id,
    htxCode: 'TC',
    runId: null,
    agent: 'harvest-ready',
    kind,
    payload,
    reasonVi: 'lý do',
    evidence: { rows: [], sha256: 'x' },
    confidence: null,
    risk: 'low',
    status: 'proposed',
    origin: 'agent',
    requestedBy: null,
    dedupeKey: id,
    createdAt: new Date(createdAt),
    expiresAt: new Date('2026-12-31T00:00:00Z'),
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

function source(overrides: Partial<CandidateSource> = {}): CandidateSource {
  return {
    rainParcelCodes: jest.fn().mockResolvedValue(['P-TC-001']),
    withdrawalRows: jest.fn().mockResolvedValue([]),
    parcelCodesByIds: jest.fn().mockResolvedValue(new Map([['parcel-2', 'P-TC-002']])),
    estimatedKgByParcelIds: jest.fn().mockResolvedValue(new Map([['parcel-2', 400]])),
    staffPresent: jest.fn().mockResolvedValue(null),
    parcelCodesOfEntries: jest.fn().mockResolvedValue(new Map([['entry-1', 'P-TC-004']])),
    ...overrides,
  }
}

describe('CampaignCandidatesUseCase (C3)', () => {
  const day = '2026-11-27'
  const now = new Date('2026-11-26T23:00:00Z')

  it('lists open proposals with parcel codes, goals and the fixed flags', async () => {
    const proposals = [
      proposal('p-harvest', 'harvest.approve', { parcel_id: 'parcel-2' }, '2026-11-26T01:00:00Z'),
      proposal('p-journal', 'journal.reject', { entry_id: 'entry-1', reason_code: 'MISSING_INFO' }, '2026-11-26T02:00:00Z'),
      proposal('p-disease', 'disease.inspection', { parcel_codes: ['P-TC-003', 'P-TC-005'] }, '2026-11-26T03:00:00Z'),
      proposal('p-notice', 'notification.internal', {}, '2026-11-26T04:00:00Z'),
    ]
    const list = jest.fn().mockResolvedValue(proposals)
    const result = await new CampaignCandidatesUseCase({ list }, source()).execute('TC', day, now)

    expect(list).toHaveBeenCalledWith('TC', { statuses: ['proposed'], limit: 500 })
    expect(result.day).toBe(day)
    expect(result.people_available).toBeNull()
    expect(source().staffPresent).toBeDefined()
    expect(result.rain_parcel_codes).toEqual(['P-TC-001'])
    expect(result.proposals).toEqual([
      expect.objectContaining({ id: 'p-harvest', parcel_codes: ['P-TC-002'], goal_key: 'harvest', target: 1, involves_spraying: false, people_needed: 0 }),
      expect.objectContaining({ id: 'p-journal', parcel_codes: ['P-TC-004'], goal_key: 'journal_backlog', target: 1 }),
      expect.objectContaining({ id: 'p-disease', parcel_codes: ['P-TC-003', 'P-TC-005'], goal_key: 'inspection' }),
      expect.objectContaining({ id: 'p-notice', parcel_codes: [], goal_key: 'internal_notice' }),
    ])
  })

  it('marks a parcel withdrawn only when a non-draft spraying is still inside its period on that day', async () => {
    const dayStart = new Date('2026-11-26T17:00:00Z') // 27 Nov 00:00 Vietnam time
    const withdrawalRows = [
      { parcel_code: 'P-TC-003', safe_harvest_date: new Date('2026-12-01T00:00:00Z') },
      { parcel_code: 'P-TC-006', safe_harvest_date: new Date('2026-11-20T00:00:00Z') },
    ]
    const src = source({ withdrawalRows: jest.fn().mockResolvedValue(withdrawalRows) })
    const result = await new CampaignCandidatesUseCase({ list: jest.fn().mockResolvedValue([]) }, src).execute('TC', day, now)

    expect(src.withdrawalRows).toHaveBeenCalledWith('TC', dayStart)
    expect(result.withdrawal_parcel_codes).toEqual(['P-TC-003'])
  })

  it('takes people_available from the attendance report of the day and null when none was reported', async () => {
    const present = source({ staffPresent: jest.fn().mockResolvedValue(6) })
    const result = await new CampaignCandidatesUseCase({ list: jest.fn().mockResolvedValue([]) }, present).execute('TC', day, now)
    expect(present.staffPresent).toHaveBeenCalledWith('TC', day)
    expect(result.people_available).toBe(6)
  })

  it('needs one person for a staff task, two for a harvest over 500 kg and none otherwise', async () => {
    const proposals = [
      proposal('p-staff', 'staff.task.create', { title_vi: 't', due_date: day, assignee_ref: 'E1', parcel_id: 'parcel-2', source: { kind: 'x' } }, '2026-11-26T01:00:00Z'),
      proposal('p-big', 'harvest.approve', { parcel_id: 'parcel-big' }, '2026-11-26T02:00:00Z'),
      proposal('p-small', 'harvest.approve', { parcel_id: 'parcel-2' }, '2026-11-26T03:00:00Z'),
      proposal('p-edge', 'harvest.approve', { parcel_id: 'parcel-500' }, '2026-11-26T04:00:00Z'),
      proposal('p-notice', 'notification.internal', {}, '2026-11-26T05:00:00Z'),
    ]
    const src = source({ estimatedKgByParcelIds: jest.fn().mockResolvedValue(new Map([['parcel-big', 501], ['parcel-2', 400], ['parcel-500', 500]])) })
    const result = await new CampaignCandidatesUseCase({ list: jest.fn().mockResolvedValue(proposals) }, src).execute('TC', day, now)
    expect(Object.fromEntries(result.proposals.map((p) => [p.id, p.people_needed]))).toEqual({
      'p-staff': 1, 'p-big': 2, 'p-small': 0, 'p-edge': 0, 'p-notice': 0,
    })
  })

  it('returns an empty proposal list when nothing is open', async () => {
    const result = await new CampaignCandidatesUseCase({ list: jest.fn().mockResolvedValue([]) }, source()).execute('TC', day, now)
    expect(result.proposals).toEqual([])
  })
})
