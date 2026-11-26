/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ACTION_CATALOG } from '@/application/agent/action-catalog'
import { improvementAdoptAction } from '@/application/agent/actions/improvement-adopt.action'
import { canonicalJson, evidenceDigest, sha256Hex } from '@/domain/agent/evidence'
import type { EvidenceRow } from '@/domain/agent/proposal'
import type { Tenant } from '@/lib/api/tenant'

const mockFindById = jest.fn()
const mockBroadcast = jest.fn()
const mockListUsersByRole = jest.fn()

jest.mock('@/infrastructure/db/agent/PrismaImprovementRepository', () => ({
  PrismaImprovementRepository: jest.fn().mockImplementation(() => ({ findById: (...a: unknown[]) => mockFindById(...a) })),
}))
jest.mock('@/application/notification/broadcast-announcement-usecase', () => ({
  BroadcastAnnouncementUseCase: jest.fn().mockImplementation(() => ({ execute: (...a: unknown[]) => mockBroadcast(...a) })),
}))
jest.mock('@/infrastructure/db/auth/keycloak-admin.adapter', () => ({
  KeycloakAdminAdapter: jest.fn().mockImplementation(() => ({ listUsersByRole: (...a: unknown[]) => mockListUsersByRole(...a) })),
}))
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => ({
  PrismaNotificationRepository: jest.fn(),
}))

beforeEach(() => jest.clearAllMocks())

const manager: Tenant = { userId: 'mgr-1', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' }
const IMPROVEMENT_ID = '00000000-0000-0000-0000-000000000020'

function improvementRow(kind: 'process' | 'template'): EvidenceRow {
  const values = { id: IMPROVEMENT_ID, kind, title_vi: 'Bắt buộc ghi liều lượng', rationale_vi: 'Có 40% nhật ký thiếu liều lượng.', metric_key: 'journal_missing_info_rate', template: null }
  return { table: 'improvements', id: IMPROVEMENT_ID, sha256: sha256Hex(canonicalJson(values)), values }
}

describe('improvement.adopt', () => {
  it('is in the catalogue as a manager-approved, never-automatic action', () => {
    expect(ACTION_CATALOG['improvement.adopt']).toBe(improvementAdoptAction)
    expect(improvementAdoptAction).toMatchObject({ risk: 'low', approverRoles: ['manager'], autonomy: 'never', subjectTable: 'improvements' })
  })

  it('payload is exactly the improvement id', () => {
    expect(improvementAdoptAction.payloadSchema.safeParse({ improvement_id: IMPROVEMENT_ID }).success).toBe(true)
    expect(improvementAdoptAction.payloadSchema.safeParse({ improvement_id: 'not-a-uuid' }).success).toBe(false)
    expect(improvementAdoptAction.payloadSchema.safeParse({ improvement_id: IMPROVEMENT_ID, title_vi: 'x' }).success).toBe(false)
  })

  it('previews the improvement title and rationale from its evidence row', () => {
    const row = improvementRow('process')
    const lines = improvementAdoptAction.preview({ improvement_id: IMPROVEMENT_ID }, undefined, { rows: [row], sha256: evidenceDigest([row]) })
    expect(lines).toEqual(['Bắt buộc ghi liều lượng', 'Có 40% nhật ký thiếu liều lượng.'])
  })

  it('a process improvement is sent to the cooperative officers and managers', async () => {
    mockFindById.mockResolvedValueOnce({ id: IMPROVEMENT_ID, kind: 'process', titleVi: 'Bắt buộc ghi liều lượng', rationaleVi: 'Có 40% nhật ký thiếu liều lượng.', template: null })
    mockListUsersByRole.mockResolvedValueOnce([{ id: 'off-1' }]).mockResolvedValueOnce([{ id: 'mgr-1' }, { id: 'off-1' }])
    const result = await improvementAdoptAction.execute({ improvement_id: IMPROVEMENT_ID }, manager)
    expect(mockFindById).toHaveBeenCalledWith('TC', IMPROVEMENT_ID)
    expect(mockBroadcast).toHaveBeenCalledWith('Bắt buộc ghi liều lượng', 'Có 40% nhật ký thiếu liều lượng.', 'mgr-1', ['off-1', 'mgr-1'])
    expect(result).toEqual({ improvement_id: IMPROVEMENT_ID, kind: 'process', recipients: 2 })
  })

  it('a template improvement activates its template without any notification', async () => {
    const template = { weekday: 1, goal_key: 'harvest', title_vi: 'Nhắc thu hoạch' }
    mockFindById.mockResolvedValueOnce({ id: IMPROVEMENT_ID, kind: 'template', titleVi: 'Nhắc thu hoạch', rationaleVi: 'r', template })
    const result = await improvementAdoptAction.execute({ improvement_id: IMPROVEMENT_ID }, manager)
    expect(mockBroadcast).not.toHaveBeenCalled()
    expect(result).toEqual({ improvement_id: IMPROVEMENT_ID, kind: 'template', template })
  })

  it('refuses an improvement of another cooperative (not found in this one)', async () => {
    mockFindById.mockResolvedValueOnce(null)
    await expect(improvementAdoptAction.execute({ improvement_id: IMPROVEMENT_ID }, manager)).rejects.toThrow()
    expect(mockBroadcast).not.toHaveBeenCalled()
  })
})
