/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { GET as todayCampaign } from '@/app/api/agent/campaigns/today/route'
import { POST as campaignDecision } from '@/app/api/agent/campaigns/[id]/decision/route'
import { CampaignClosedError } from '@/application/agent/campaign/campaign-errors'
import { requireTenant } from '@/lib/api/tenant'

const findForDay = jest.fn()
const items = jest.fn()
const approve = jest.fn()
const drop = jest.fn()

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
const activeTemplates = jest.fn()

jest.mock('@/infrastructure/db/agent/PrismaImprovementRepository', () => ({
  PrismaImprovementRepository: jest.fn().mockImplementation(() => ({ activeTemplates })),
}))
jest.mock('@/infrastructure/db/agent/PrismaCampaignRepository', () => ({
  PrismaCampaignRepository: jest.fn().mockImplementation(() => ({ findForDay, items })),
}))
jest.mock('@/application/telegram/telegram-services', () => ({
  campaignServices: jest.fn(() => ({ repo: { findForDay, items }, approve: { execute: approve }, drop: { execute: drop } })),
}))

const CAMPAIGN_ID = '00000000-0000-4000-8000-0000000000c1'
const manager = { userId: 'mgr-1', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' }

function post(body: unknown, id = CAMPAIGN_ID) {
  const request = new Request(`http://localhost/api/agent/campaigns/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return campaignDecision(request, { params: Promise.resolve({ id }) })
}

describe('GET /api/agent/campaigns/today', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    activeTemplates.mockResolvedValue([])
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'mgr-1', name: 'Trưởng HTX', role: 'manager' } })
    ;(requireTenant as jest.Mock).mockResolvedValue(manager)
  })

  test('denies a farmer with 403', async () => {
    ;(requireTenant as jest.Mock).mockResolvedValueOnce({ ...manager, role: 'farmer' })
    const res = await todayCampaign(new Request('http://localhost/api/agent/campaigns/today'), {} as never)
    expect(res.status).toBe(403)
  })

  test('adds the template reminders of the campaign weekday beside the view (contract C7)', async () => {
    // 2026-11-30 is a Monday in Vietnam: its weekday is 1.
    findForDay.mockResolvedValueOnce({
      id: CAMPAIGN_ID, htxCode: 'TC', day: '2026-11-30', status: 'draft', goals: [], summaryVi: 'Tóm tắt.', decidedByName: null,
    })
    items.mockResolvedValueOnce([])
    activeTemplates.mockResolvedValueOnce([{ titleVi: 'Nhắc thu hoạch' }, { titleVi: 'Nhắc phun thuốc' }, { titleVi: 'Nhắc thứ ba' }])
    const res = await todayCampaign(new Request('http://localhost/api/agent/campaigns/today'), {} as never)
    expect(activeTemplates).toHaveBeenCalledWith('TC', 1)
    const body = await res.json()
    expect(body.campaign.reminders).toEqual(['Nhắc theo mẫu: Nhắc thu hoạch', 'Nhắc theo mẫu: Nhắc phun thuốc'])
  })

  test('answers campaign null when there is none today', async () => {
    findForDay.mockResolvedValueOnce(null)
    const res = await todayCampaign(new Request('http://localhost/api/agent/campaigns/today'), {} as never)
    expect(await res.json()).toEqual({ campaign: null })
  })

  test('answers the campaign with its items', async () => {
    findForDay.mockResolvedValueOnce({
      id: CAMPAIGN_ID, htxCode: 'TC', day: '2026-11-27', status: 'draft', goals: [], summaryVi: 'Tóm tắt.', decidedByName: null,
    })
    items.mockResolvedValueOnce([
      { campaignId: CAMPAIGN_ID, proposalId: 'p1', position: 1, goalKey: 'harvest', target: 1, kind: 'harvest.approve', risk: 'high', proposalStatus: 'proposed' },
    ])
    const res = await todayCampaign(new Request('http://localhost/api/agent/campaigns/today'), {} as never)
    const body = await res.json()
    expect(findForDay).toHaveBeenCalledWith('TC', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    expect(body.campaign).toMatchObject({ id: CAMPAIGN_ID, status: 'draft', items: [{ position: 1, proposalId: 'p1', risk: 'high', goalLine: '1 việc' }] })
  })
})

describe('POST /api/agent/campaigns/[id]/decision', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'mgr-1', name: 'Trưởng HTX', role: 'manager' } })
    ;(requireTenant as jest.Mock).mockResolvedValue(manager)
  })

  test('denies a farmer with 403', async () => {
    ;(requireTenant as jest.Mock).mockResolvedValueOnce({ ...manager, role: 'farmer' })
    expect((await post({ decision: 'approve_all' })).status).toBe(403)
    expect(approve).not.toHaveBeenCalled()
  })

  test('approve_all answers the counts', async () => {
    approve.mockResolvedValueOnce({ executed: 2, waitingHigh: 1, forwarded: 0, failed: 0, alreadyDecided: 0 })
    const res = await post({ decision: 'approve_all' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { executed: 2, waitingHigh: 1, forwarded: 0, failed: 0, alreadyDecided: 0 } })
    expect(approve).toHaveBeenCalledWith(CAMPAIGN_ID, manager, 'Trưởng HTX', 'web')
  })

  test('a campaign that is no longer draft or partial answers 409', async () => {
    approve.mockRejectedValueOnce(new CampaignClosedError())
    const res = await post({ decision: 'approve_all' })
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('CAMPAIGN_CLOSED')
  })

  test('drop runs the drop use case', async () => {
    const res = await post({ decision: 'drop' })
    expect(res.status).toBe(200)
    expect(drop).toHaveBeenCalledWith(CAMPAIGN_ID, manager, 'Trưởng HTX')
  })

  test('an unknown decision or a malformed id is refused with 400', async () => {
    expect((await post({ decision: 'maybe' })).status).toBe(400)
    expect((await post({ decision: 'drop' }, 'not-a-uuid')).status).toBe(400)
  })
})
