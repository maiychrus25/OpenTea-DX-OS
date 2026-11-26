/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GET } from '@/app/api/internal/agent/staff/inputs/route'

const list = jest.fn(async () => [])
jest.mock('@/lib/api/internal-agent-auth', () => ({ requireAgentCaller: jest.fn(async () => ({ htxCode: 'TC' })) }))
jest.mock('@/infrastructure/db/agent/PrismaProposalRepository', () => ({ PrismaProposalRepository: jest.fn().mockImplementation(() => ({ list: (...a: unknown[]) => (list as (...x: unknown[]) => unknown)(...a) })) }))
jest.mock('@/infrastructure/db/agent/PrismaCampaignCandidateSource', () => ({ PrismaCampaignCandidateSource: jest.fn().mockImplementation(() => ({ parcelsByIdsOrCodes: async () => [] })) }))
jest.mock('@/infrastructure/db/agent/PrismaStaffSyncRepository', () => ({
  PrismaStaffSyncRepository: jest.fn().mockImplementation(() => ({ activeRoster: async () => [{ staffRef: 'E1', name: 'Lan', department: null, active: true }], attendance: async () => 4 })),
}))

describe('GET /api/internal/agent/staff/inputs', () => {
  it('answers the inputs of the token cooperative under data', async () => {
    const res = await GET(new Request('http://localhost/api/internal/agent/staff/inputs'), {} as never)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ proposals: [], roster: [{ staff_ref: 'E1', name: 'Lan', department: null, active: true }], attendance: { present: 4 } })
    expect(list).toHaveBeenCalledWith('TC', expect.anything())
  })
})
