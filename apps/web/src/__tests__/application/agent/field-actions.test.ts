/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Side effects are replaced by recording fakes; the action code itself runs for real.
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => {
  const notifier = {
    broadcastAnnouncement: jest.fn(async () => undefined),
    notifyRecipients: jest.fn(async () => undefined),
  }
  return { PrismaNotificationRepository: jest.fn(() => notifier), __notifier: notifier }
})
jest.mock('@/infrastructure/db/auth/keycloak-admin.adapter', () => {
  const admin = {
    listUsersByRole: jest.fn(async (role: string) =>
      role === 'officer' ? [{ id: 'off-1' }] : [{ id: 'mgr-1' }, { id: 'off-1' }]
    ),
  }
  return { KeycloakAdminAdapter: jest.fn(() => admin), __admin: admin }
})
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({ PrismaParcelRepository: jest.fn() }))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({ PrismaJournalRepository: jest.fn() }))
jest.mock('@/lib/api/tenant-guard', () => {
  const guardParcel = jest.fn(async () => undefined)
  return { TenantGuard: jest.fn(() => ({ parcel: guardParcel })), __guardParcel: guardParcel }
})
jest.mock('@/application/farm/approve-harvest-usecase', () => {
  const approve = jest.fn(async () => ({ id: 'parcel-1', status: 'HARVEST_APPROVED' }))
  return { ApproveHarvestUseCase: jest.fn(() => ({ execute: approve })), __approve: approve }
})

import { DecideProposalUseCase } from '@/application/agent/DecideProposalUseCase'
import { getAction } from '@/application/agent/action-catalog'
import { DomainError } from '@/domain/errors/DomainError'
import { evidenceDigest } from '@/domain/agent/evidence'
import type { Tenant } from '@/lib/api/tenant'

const notifier = jest.requireMock('@/infrastructure/db/notification/prisma-notification-repository').__notifier
const approveUseCase = jest.requireMock('@/application/farm/approve-harvest-usecase').__approve
const guardParcel = jest.requireMock('@/lib/api/tenant-guard').__guardParcel

const manager: Tenant = { userId: 'user-mgr', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' }
const emptyEvidence = { rows: [], sha256: evidenceDigest([]) }

beforeEach(() => {
  jest.clearAllMocks()
})

function proposalRepo(kind: string, payload: Record<string, unknown>) {
  const proposal = {
    id: '4f0c2b1e-9d3a-4c7b-8e21-2a6f5d9c1b11',
    htxCode: 'TC',
    kind,
    agent: 'harvest-ready',
    payload,
    evidence: emptyEvidence,
    expiresAt: new Date('2026-11-26T00:00:00.000Z'),
    status: 'proposed',
    decidedByName: null,
    decidedAt: null,
  }
  return {
    proposal,
    repo: {
      findById: jest.fn(async () => proposal),
      claim: jest.fn(async () => proposal),
      markRejected: jest.fn(),
      markStale: jest.fn(),
      markExpired: jest.fn(),
      markExecuted: jest.fn(async () => undefined),
      markFailed: jest.fn(async () => undefined),
    },
  }
}

describe('harvest.approve', () => {
  test('executes ApproveHarvestUseCase as the approver, after the tenant guard', async () => {
    const action = getAction('harvest.approve')

    const result = await action.execute({ parcel_id: 'parcel-1' }, manager)

    expect(guardParcel).toHaveBeenCalledWith('parcel-1')
    expect(approveUseCase).toHaveBeenCalledWith('parcel-1', 'user-mgr', 'manager')
    expect(result).toEqual({ parcel_id: 'parcel-1', status: 'HARVEST_APPROVED' })
  })

  test('a harvest refused by the use case leaves the proposal failed with its message', async () => {
    approveUseCase.mockRejectedValueOnce(new DomainError('Chưa qua thời gian cách ly. An toàn thu hoạch từ ngày 26/11/2026'))
    const { repo } = proposalRepo('harvest.approve', { parcel_id: 'parcel-1' })
    const useCase = new DecideProposalUseCase(repo as never)

    const outcome = await useCase.execute({
      proposalId: '4f0c2b1e-9d3a-4c7b-8e21-2a6f5d9c1b11',
      tenant: manager,
      userName: 'Quản lý',
      decision: 'approve',
      channel: 'web',
      now: new Date('2026-11-25T03:00:00.000Z'),
    })

    expect(outcome).toEqual({
      outcome: 'failed',
      error: 'Chưa qua thời gian cách ly. An toàn thu hoạch từ ngày 26/11/2026',
    })
    expect(repo.markFailed).toHaveBeenCalled()
    expect(repo.markExecuted).not.toHaveBeenCalled()
  })

  test('preview names the parcel from the evidence row, with no internal id', () => {
    const action = getAction('harvest.approve')
    const evidence = {
      rows: [{ table: 'parcels', id: 'parcel-1', sha256: 'h', values: { parcel_code: 'P-TC-003' } }],
      sha256: 'unused',
    }

    expect(action.preview({ parcel_id: 'parcel-1' }, undefined, evidence)).toEqual(['Duyệt thu hoạch thửa P-TC-003'])
    expect(action.preview({ parcel_id: 'parcel-1' })).toEqual(['Duyệt thu hoạch một thửa'])
  })
})

describe('disease.inspection', () => {
  const payload = {
    disease: 'helopeltis',
    report_ids: ['report-1', 'report-2', 'report-3'],
    parcel_codes: ['P-TC-001', 'P-TC-003'],
    radius_m: 2000,
    days: 7,
  }

  test('notifies officers and managers with the deep link', async () => {
    const action = getAction('disease.inspection')

    await action.execute(payload, manager)

    expect(notifier.notifyRecipients).toHaveBeenCalledWith(
      expect.arrayContaining(['off-1', 'mgr-1']),
      {
        type: 'DISEASE_REPORT',
        title: 'Đề nghị kiểm tra dịch bệnh',
        body: 'Có 3 báo cáo Bọ xít muỗi trong 7 ngày, trong bán kính 2000 m: thửa P-TC-001, P-TC-003. Đề nghị cán bộ đi kiểm tra.',
        deepLinkUrl: '/officer/diseases',
      }
    )
  })

  test('a disease outside the label set, such as healthy, is not a valid payload', () => {
    const action = getAction('disease.inspection')
    expect(action.payloadSchema.safeParse({ ...payload, disease: 'healthy' }).success).toBe(false)
    expect(action.payloadSchema.safeParse(payload).success).toBe(true)
  })
})
