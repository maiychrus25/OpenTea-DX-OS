/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Notification side effects are replaced by recording fakes; the action code itself runs for real.
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
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: { parcel: { findMany: jest.fn() } },
}))

import { CreateProposalUseCase } from '@/application/agent/CreateProposalUseCase'
import { DecideProposalUseCase } from '@/application/agent/DecideProposalUseCase'
import { getAction } from '@/application/agent/action-catalog'
import { renderNotification } from '@/application/agent/actions/message-templates'
import { evidenceDigest } from '@/domain/agent/evidence'
import { ValidationError } from '@/domain/errors'
import type { Tenant } from '@/lib/api/tenant'
import { prisma } from '@/infrastructure/db/prisma.client'

const notifier = jest.requireMock('@/infrastructure/db/notification/prisma-notification-repository').__notifier
const findParcels = prisma.parcel.findMany as jest.Mock

const manager: Tenant = { userId: 'user-mgr', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' }
const emptyEvidence = { rows: [], sha256: evidenceDigest([]) }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('test 32: a household message with agent text is refused', () => {
  const householdPayload = {
    template: 'dry_soil',
    slots: { parcel_codes: ['P-TC-001'], value_pct: 20, threshold_pct: 35 },
    subjects: ['dry_soil:2026-11-25'],
  }
  const base = { htxCode: 'TC', agent: 'field-watch', kind: 'notification.households', reasonVi: 'Đất khô', evidence: emptyEvidence, origin: 'agent' as const }

  test.each([
    ['a body written by the agent', { ...householdPayload, body: 'Lời nhắn tự do' }],
    ['a note_vi from the agent', { ...householdPayload, note_vi: 'Lời nhắn tự do' }],
    ['a parcel_codes slot holding a sentence', { ...householdPayload, slots: { ...householdPayload.slots, parcel_codes: ['Đất khô ở thửa'] } }],
    ['an unknown template', { ...householdPayload, template: 'free_text' }],
  ])('refuses %s with INVALID_PAYLOAD', async (_name, payload) => {
    const repo = { create: jest.fn(), createdSince: jest.fn(async () => false) }
    const useCase = new CreateProposalUseCase(repo)

    await expect(useCase.execute({ ...base, payload })).rejects.toThrow('INVALID_PAYLOAD')
    expect(repo.create).not.toHaveBeenCalled()
  })
})

describe('templates render the Vietnamese copy of spec C3', () => {
  test.each([
    [
      'sensor_silent',
      { parcel_code: 'P-TC-003', sensor: 'soil_moisture', hours: 8 },
      'Cảm biến không gửi số đo',
      'Cảm biến độ ẩm đất ở thửa P-TC-003 không gửi số đo 8 giờ. Cần kiểm tra pin hoặc kết nối.',
    ],
    [
      'dry_soil',
      { parcel_codes: ['P-TC-001', 'P-TC-003'], value_pct: 28, threshold_pct: 35 },
      'Đất khô',
      'Đất ở thửa P-TC-001, P-TC-003 đang khô: độ ẩm 28% dưới ngưỡng 35%. Nên tưới giữ ẩm cho chè.',
    ],
    [
      'heat',
      { parcel_codes: ['P-TC-011'], value_c: 36 },
      'Nắng nóng',
      'Nhiệt độ ở thửa P-TC-011 lên 36°C. Nên hái chè sớm trước 9 giờ và che nắng cho búp non.',
    ],
    [
      'frost',
      { parcel_codes: ['P-TC-011'], value_c: 2 },
      'Nguy cơ sương muối',
      'Nhiệt độ ở thửa P-TC-011 xuống 2°C, có nguy cơ sương muối. Nên phủ gốc và tưới phun giữ ấm cho chè.',
    ],
    [
      'rain_after_spray',
      { parcel_codes: ['P-TC-003'], date: '2026-11-26', rain_mm: 23 },
      'Mưa sau khi phun thuốc',
      'Dự báo mưa khoảng 23 mm ngày 26/11/2026 ở thửa P-TC-003, ngay sau lần phun thuốc gần đây. Thuốc có thể bị rửa trôi: hỏi cán bộ trước khi phun lại.',
    ],
    [
      'disease_nearby',
      { disease: 'helopeltis', parcel_codes: ['P-TC-001', 'P-TC-003'], count: 3, days: 7 },
      'Cảnh báo dịch bệnh',
      'Có 3 báo cáo Bọ xít muỗi trong 7 ngày qua ở các thửa P-TC-001, P-TC-003. Kiểm tra lá chè và báo cán bộ nếu thấy dấu hiệu bệnh.',
    ],
  ])('%s', (template, slots, title, body) => {
    expect(renderNotification(template, slots)).toEqual({ title, body })
  })
})

describe('notification actions', () => {
  test('a human note is appended on decision', async () => {
    const proposal = {
      id: '4f0c2b1e-9d3a-4c7b-8e21-2a6f5d9c1b00',
      htxCode: 'TC',
      kind: 'notification.internal',
      agent: 'field-watch',
      payload: {
        template: 'sensor_silent',
        slots: { parcel_code: 'P-TC-003', sensor: 'soil_moisture', hours: 8 },
        subjects: ['sensor_silent:reading-1'],
      },
      evidence: emptyEvidence,
      expiresAt: new Date('2026-11-26T00:00:00.000Z'),
      status: 'proposed',
      decidedByName: null,
      decidedAt: null,
    }
    const repo = {
      findById: jest.fn(async () => proposal),
      claim: jest.fn(async () => proposal),
      markRejected: jest.fn(),
      markStale: jest.fn(),
      markExpired: jest.fn(),
      markExecuted: jest.fn(async () => undefined),
      markFailed: jest.fn(async () => undefined),
    }
    const useCase = new DecideProposalUseCase(repo as never)

    const outcome = await useCase.execute({
      proposalId: proposal.id,
      tenant: manager,
      userName: 'Quản lý',
      decision: 'approve',
      editedPayload: { note_vi: 'Kiểm tra pin trước 9 giờ.' },
      channel: 'web',
      now: new Date('2026-11-25T03:00:00.000Z'),
    })

    expect(outcome.outcome).toBe('executed')
    const { title, body } = renderNotification('sensor_silent', proposal.payload.slots)
    expect(notifier.broadcastAnnouncement).toHaveBeenCalledWith(
      title,
      `${body}\n\nKiểm tra pin trước 9 giờ.`,
      'user-mgr',
      expect.arrayContaining(['mgr-1', 'off-1'])
    )
  })

  test('recipients are the cooperative households of the parcels', async () => {
    findParcels.mockResolvedValueOnce([
      { parcel_code: 'P-TC-001', household: { id: 'h1', keycloak_user_id: 'user-h1' } },
      { parcel_code: 'P-TC-003', household: { id: 'h2', keycloak_user_id: 'user-h2' } },
    ])
    const action = getAction('notification.households')

    const result = await action.execute(
      {
        template: 'dry_soil',
        slots: { parcel_codes: ['P-TC-001', 'P-TC-003'], value_pct: 20, threshold_pct: 35 },
        subjects: ['dry_soil:2026-11-25'],
      },
      manager
    )

    expect(findParcels).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parcel_code: { in: ['P-TC-001', 'P-TC-003'] }, household: { htx_profile_id: 'htx-tc' } },
      })
    )
    expect(notifier.notifyRecipients).toHaveBeenCalledWith(
      ['user-h1', 'user-h2'],
      expect.objectContaining({ type: 'ANNOUNCEMENT', title: 'Đất khô' })
    )
    expect(result).toEqual({ sent: 2, skipped_without_account: 0 })
  })

  test('a household without an account is skipped and counted', async () => {
    findParcels.mockResolvedValueOnce([
      { parcel_code: 'P-TC-001', household: { id: 'h1', keycloak_user_id: 'user-h1' } },
      { parcel_code: 'P-TC-003', household: { id: 'h2', keycloak_user_id: null } },
    ])
    const action = getAction('notification.households')

    const result = await action.execute(
      {
        template: 'dry_soil',
        slots: { parcel_codes: ['P-TC-001', 'P-TC-003'], value_pct: 20, threshold_pct: 35 },
        subjects: ['dry_soil:2026-11-25'],
      },
      manager
    )

    expect(notifier.notifyRecipients).toHaveBeenCalledWith(['user-h1'], expect.anything())
    expect(result).toEqual({ sent: 1, skipped_without_account: 1 })
  })

  test('a parcel code of another cooperative makes execute refuse and send nothing', async () => {
    // The query is scoped to the approver's cooperative, so the LB parcel is not returned.
    findParcels.mockResolvedValueOnce([{ parcel_code: 'P-TC-001', household: { id: 'h1', keycloak_user_id: 'user-h1' } }])
    const action = getAction('notification.households')

    await expect(
      action.execute(
        {
          template: 'dry_soil',
          slots: { parcel_codes: ['P-LB-002', 'P-TC-001'], value_pct: 20, threshold_pct: 35 },
          subjects: ['dry_soil:2026-11-25'],
        },
        manager
      )
    ).rejects.toThrow(ValidationError)
    expect(notifier.notifyRecipients).not.toHaveBeenCalled()
  })

  test('the internal notification goes to officers and managers through the broadcast use case', async () => {
    const action = getAction('notification.internal')

    await action.execute(
      { template: 'sensor_silent', slots: { parcel_code: 'P-TC-003', sensor: 'soil_moisture', hours: 8 }, subjects: ['sensor_silent:r1'] },
      manager
    )

    expect(notifier.broadcastAnnouncement).toHaveBeenCalledWith(
      'Cảm biến không gửi số đo',
      'Cảm biến độ ẩm đất ở thửa P-TC-003 không gửi số đo 8 giờ. Cần kiểm tra pin hoặc kết nối.',
      'user-mgr',
      expect.arrayContaining(['mgr-1', 'off-1'])
    )
  })
})
