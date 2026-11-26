/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { StaffInputsUseCase } from '@/application/agent/staff/StaffInputsUseCase'
import type { Proposal } from '@/domain/agent/proposal'

const now = new Date('2026-11-26T23:00:00Z') // 27 Nov 06:00 in Vietnam

function proposal(id: string, kind: string, payload: Record<string, unknown>, over: Partial<Proposal> = {}): Proposal {
  return {
    id, htxCode: 'TC', runId: null, agent: 'a', kind, payload, reasonVi: 'x', evidence: { rows: [], sha256: 'x' }, confidence: null,
    risk: 'low', status: 'executed', origin: 'agent', requestedBy: null, dedupeKey: id, createdAt: new Date('2026-11-26T01:00:00Z'),
    expiresAt: new Date('2026-12-31T00:00:00Z'), decidedBy: null, decidedByName: null, decidedAt: new Date('2026-11-26T22:00:00Z'),
    decisionChannel: null, decisionNote: null, editedPayload: null, executedAt: new Date('2026-11-26T22:00:00Z'), result: null, ...over,
  }
}

describe('StaffInputsUseCase (C4)', () => {
  it('lists the sources of the last 24 hours with parcel codes, the roster, attendance and tasks per assignee today', async () => {
    const list = jest.fn(async (_htx: string, filter: { kind?: string }) =>
      filter.kind === 'staff.task.create'
        ? [
            proposal('t1', 'staff.task.create', { assignee_ref: 'E1' }, { status: 'proposed', createdAt: new Date('2026-11-26T22:30:00Z') }),
            proposal('t2', 'staff.task.create', { assignee_ref: 'E1' }, { status: 'sent_to_staff_app', editedPayload: { assignee_ref: 'E2' }, createdAt: new Date('2026-11-26T22:31:00Z') }),
            proposal('t3', 'staff.task.create', { assignee_ref: 'E1' }, { createdAt: new Date('2026-11-25T01:00:00Z') }),
          ]
        : [
            proposal('h1', 'harvest.approve', { parcel_id: 'parcel-2' }),
            proposal('d1', 'disease.inspection', { parcel_codes: ['P-TC-003'] }),
            proposal('n1', 'notification.households', { template: 'dry_soil', slots: { parcel_codes: ['P-TC-004'] } }),
            proposal('n2', 'notification.households', { template: 'weather_warning', slots: { parcel_codes: ['P-TC-005'] } }),
            proposal('old', 'harvest.approve', { parcel_id: 'parcel-2' }, { executedAt: new Date('2026-11-25T01:00:00Z'), decidedAt: new Date('2026-11-25T01:00:00Z') }),
            proposal('j1', 'journal.approve', { entry_ids: ['e'] }),
          ]
    )
    const staff = {
      activeRoster: jest.fn(async () => [{ staffRef: 'E1', name: 'Lan', department: 'Kỹ thuật', active: true }]),
      attendance: jest.fn(async () => 5),
    }
    const parcelCodes = jest.fn(async () => new Map([['parcel-2', 'P-TC-002']]))

    const result = await new StaffInputsUseCase({ list } as never, staff, parcelCodes).execute('TC', now)

    expect(list).toHaveBeenCalledWith('TC', expect.objectContaining({ statuses: ['executed'] }))
    expect(staff.attendance).toHaveBeenCalledWith('TC', '2026-11-27')
    expect(result.day).toBe('2026-11-27')
    expect(result.sources.map((s) => [s.proposal_id, s.kind, s.template, s.parcel_codes])).toEqual([
      ['h1', 'harvest.approve', null, ['P-TC-002']],
      ['d1', 'disease.inspection', null, ['P-TC-003']],
      ['n1', 'notification.households', 'dry_soil', ['P-TC-004']],
    ])
    expect(result.roster).toEqual([{ staff_ref: 'E1', name: 'Lan', department: 'Kỹ thuật' }])
    expect(result.attendance_present).toBe(5)
    expect(result.assigned_today).toEqual({ E1: 1, E2: 1 })
  })

  it('answers null attendance and an empty roster when the staff app reported nothing', async () => {
    const list = jest.fn(async () => [])
    const result = await new StaffInputsUseCase({ list } as never, { activeRoster: async () => [], attendance: async () => null }, async () => new Map()).execute('TC', now)
    expect(result).toMatchObject({ sources: [], roster: [], attendance_present: null, assigned_today: {} })
  })
})
