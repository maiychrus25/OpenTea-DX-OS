/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CHAT_ACTIONS } from '@/application/telegram/chat/actions'
import type { ChatAction, ChatUser, ChoiceStep } from '@/application/telegram/chat/types'

const mockFakes = {
  households: jest.fn(),
  householdOne: jest.fn(),
  broadcast: jest.fn(),
  markRead: jest.fn(),
  recent: jest.fn(),
  deleteOne: jest.fn(),
  listUsers: jest.fn(),
  approve: jest.fn(),
  removeMember: jest.fn(),
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
}

jest.mock('@/auth', () => {
  throw new Error('chat code loaded the browser session')
})
jest.mock('@/lib/auth/core-token', () => {
  throw new Error('chat code loaded the browser session token')
})
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    household: {
      findMany: (...a: unknown[]) => mockFakes.households(...a),
      findFirst: (...a: unknown[]) => mockFakes.householdOne(...a),
    },
  },
}))
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => ({
  PrismaNotificationRepository: jest.fn(() => ({
    getRecentByUserId: (...a: unknown[]) => mockFakes.recent(...a),
    delete: (...a: unknown[]) => mockFakes.deleteOne(...a),
  })),
}))
jest.mock('@/infrastructure/db/auth/keycloak-admin.adapter', () => ({
  KeycloakAdminAdapter: jest.fn(() => ({ listUsersByRole: (...a: unknown[]) => mockFakes.listUsers(...a) })),
}))
jest.mock('@/application/notification/broadcast-announcement-usecase', () => ({
  BroadcastAnnouncementUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.broadcast(...a) })),
}))
jest.mock('@/application/notification/mark-notification-read-usecase', () => ({
  MarkNotificationReadUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.markRead(...a) })),
}))
jest.mock('@/application/auth/approve-member.use-case', () => ({
  ApproveMemberUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.approve(...a) })),
}))
jest.mock('@/application/auth/delete-member.use-case', () => ({
  DeleteMemberUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.removeMember(...a) })),
}))
jest.mock('@/infrastructure/db/farm/PrismaHouseholdRepository', () => ({ PrismaHouseholdRepository: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaHtxProfileRepository', () => ({ PrismaHtxProfileRepository: jest.fn() }))
jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository', () => ({ PrismaHtxProfileRepository: jest.fn() }))
jest.mock('@/application/useCases/GetHtxProfileUseCase', () => ({
  GetHtxProfileUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.getProfile(...a) })),
}))
jest.mock('@/application/useCases/UpdateHtxProfileUseCase', () => ({
  UpdateHtxProfileUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockFakes.updateProfile(...a) })),
}))
// The Telegram-side farm actions of the same registry load these; the tests below never call them.
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({ PrismaParcelRepository: jest.fn() }))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({ PrismaJournalRepository: jest.fn() }))

const manager: ChatUser = {
  tenant: { userId: 'manager-1', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' },
  userName: 'Trưởng HTX',
  householdId: null,
  telegramUserId: '3003',
  chatId: 3003,
}
const farmer: ChatUser = { ...manager, tenant: { ...manager.tenant, userId: 'farmer-1', role: 'farmer' }, householdId: 'hh1' }
const deps = { photos: { put: jest.fn(), get: jest.fn(), delete: jest.fn() } }
const NOW = new Date('2026-11-27T03:00:00.000Z')

const action = (name: string): ChatAction => {
  const found = CHAT_ACTIONS.find((a) => a.name === name)
  if (!found) throw new Error(`no action ${name}`)
  return found
}
const choicesOf = (a: ChatAction, slot: string, user = manager) => (a.steps.find((s) => s.slot === slot) as ChoiceStep).choices(user, {})
const member = (id: string, active: boolean, at: number, name = `Người ${id}`) => ({
  id,
  full_name: name,
  phone: `09${id}`,
  is_active: active,
  role: 'FARMER',
  email: '',
  household_id: null,
  createdTimestamp: at,
})

beforeEach(() => {
  for (const fake of Object.values(mockFakes)) fake.mockReset()
  mockFakes.listUsers.mockImplementation(async (role: string) => (role === 'farmer' ? [member('1', true, 1), member('2', false, 3)] : role === 'officer' ? [member('3', false, 2)] : [member('9', true, 9)]))
})

describe('notification.announce', () => {
  const a = () => action('notification.announce')

  it('is for managers and offers the whole cooperative first, then up to seven households', async () => {
    expect([...a().roles]).toEqual(['manager'])
    mockFakes.households.mockResolvedValue([{ id: 'hh1', name: 'Nguyễn A' }])
    expect(await choicesOf(a(), 'audience')).toEqual([
      { value: 'all', label: 'Cả HTX' },
      { value: 'hh1', label: 'Nguyễn A' },
    ])
    expect(mockFakes.households).toHaveBeenCalledWith(expect.objectContaining({ where: { htx_profile_id: 'htx-tc' }, take: 7 }))
  })

  it('shows the audience and the text on the card', async () => {
    mockFakes.households.mockResolvedValue([])
    expect(await a().preview({ audience: 'all', text: 'Mai họp HTX' }, manager)).toEqual(['Gửi tới: Cả HTX', 'Nội dung: Mai họp HTX'])
  })

  it('broadcasts to every account of the cooperative once each', async () => {
    mockFakes.listUsers.mockImplementation(async (role: string) => [member(role === 'manager' ? 'm' : 'x', true, 1)])
    expect(await a().execute({ audience: 'all', text: 'Mai họp HTX' }, manager, deps, NOW)).toBe('Đã gửi thông báo tới 2 người.')
    expect(mockFakes.broadcast).toHaveBeenCalledWith('Thông báo từ HTX', 'Mai họp HTX', 'manager-1', ['x', 'm'])
  })

  it('sends to one household account only', async () => {
    mockFakes.householdOne.mockResolvedValue({ keycloak_user_id: 'kc-1' })
    await a().execute({ audience: 'hh1', text: 'Hi' }, manager, deps, NOW)
    expect(mockFakes.householdOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'hh1', htx_profile_id: 'htx-tc' } }))
    expect(mockFakes.broadcast).toHaveBeenCalledWith('Thông báo từ HTX', 'Hi', 'manager-1', ['kc-1'])
  })

  it("answers not found for another cooperative's household and sends nothing (Review Focus 1)", async () => {
    mockFakes.householdOne.mockResolvedValue(null)
    await expect(a().execute({ audience: 'zzz', text: 'Hi' }, manager, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
    expect(mockFakes.broadcast).not.toHaveBeenCalled()
  })

  it('says so when the household has no account', async () => {
    mockFakes.householdOne.mockResolvedValue({ keycloak_user_id: null })
    await expect(a().execute({ audience: 'hh1', text: 'Hi' }, manager, deps, NOW)).rejects.toThrow('chưa có tài khoản')
  })
})

describe('notification.read and notification.clear', () => {
  it('marks every notification of the user read through the use case', async () => {
    expect(action('notification.read').steps).toEqual([])
    expect(await action('notification.read').execute({}, farmer, deps, NOW)).toBe('Đã đánh dấu mọi thông báo là đã đọc.')
    expect(mockFakes.markRead).toHaveBeenCalledWith('farmer-1')
  })

  it('is open to every role', () => {
    for (const name of ['notification.read', 'notification.clear']) expect([...action(name).roles]).toEqual(['farmer', 'officer', 'manager'])
  })

  it('ends the flow when the user has no notification of their own', async () => {
    mockFakes.recent.mockResolvedValue([{ id: 'b1', recipient_id: null }])
    expect(await action('notification.clear').start!(farmer, NOW)).toEqual({ replyVi: 'Không có thông báo nào để xoá.' })
  })

  it('deletes only the notifications addressed to the user', async () => {
    mockFakes.recent.mockResolvedValue([
      { id: 'n1', recipient_id: 'farmer-1' },
      { id: 'b1', recipient_id: null },
      { id: 'n2', recipient_id: 'farmer-1' },
    ])
    expect(await action('notification.clear').preview({}, farmer)).toEqual(['Xoá 2 thông báo gần nhất của bạn.'])
    expect(await action('notification.clear').execute({}, farmer, deps, NOW)).toBe('Đã xoá 2 thông báo.')
    expect(mockFakes.recent).toHaveBeenCalledWith('farmer-1', 'htx-tc', 50)
    expect(mockFakes.deleteOne.mock.calls).toEqual([['farmer-1', 'n1'], ['farmer-1', 'n2']])
  })
})

describe('member.invite', () => {
  it('is not a chat action: an account and its password are made in the app, never in a Telegram message', () => {
    expect(CHAT_ACTIONS.map((a) => a.name)).not.toContain('member.invite')
    expect(CHAT_ACTIONS.flatMap((a) => a.routes)).not.toContain('POST /api/members/invite')
  })
})

describe('member.approve and member.remove', () => {
  it('offers only waiting accounts to approve, newest first', async () => {
    expect(await choicesOf(action('member.approve'), 'member_id')).toEqual([
      { value: '2', label: 'Người 2 · 092' },
      { value: '3', label: 'Người 3 · 093' },
    ])
  })

  it('ends the approve flow when nobody waits', async () => {
    mockFakes.listUsers.mockResolvedValue([member('1', true, 1)])
    expect(await action('member.approve').start!(manager, NOW)).toEqual({ replyVi: 'Không có thành viên nào đang chờ duyệt.' })
  })

  it('offers farmers and officers to remove, never managers, up to eight', async () => {
    mockFakes.listUsers.mockImplementation(async () => Array.from({ length: 6 }, (_, i) => member(`${i}`, true, i)))
    expect(await choicesOf(action('member.remove'), 'member_id')).toHaveLength(8)
    expect(mockFakes.listUsers.mock.calls.map((c) => c[0]).sort()).toEqual(['farmer', 'officer'])
  })

  it('approves and removes through the use cases', async () => {
    expect(await action('member.approve').execute({ member_id: '2' }, manager, deps, NOW)).toBe('Đã duyệt thành viên Người 2.')
    expect(mockFakes.approve).toHaveBeenCalledWith('2')
    expect(await action('member.remove').execute({ member_id: '1' }, manager, deps, NOW)).toBe('Đã xoá thành viên Người 1.')
    expect(mockFakes.removeMember).toHaveBeenCalledWith('1')
  })

  it("answers not found for another cooperative's member or a manager (Review Focus 1)", async () => {
    for (const name of ['member.approve', 'member.remove']) {
      await expect(action(name).execute({ member_id: '9' }, manager, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
      await expect(action(name).execute({ member_id: 'foreign' }, manager, deps, NOW)).rejects.toThrow('Không tìm thấy mục này.')
    }
    expect(mockFakes.approve).not.toHaveBeenCalled()
    expect(mockFakes.removeMember).not.toHaveBeenCalled()
  })
})

describe('profile.edit', () => {
  const a = () => action('profile.edit')
  const current = { name: 'HTX Tân Cương', address: 'Thái Nguyên', contact_phone: '0280', contact_email: null, crop_types: ['Chè'], season_label: null }

  it('is for managers, as the route is', () => {
    expect([...a().roles]).toEqual(['manager'])
  })

  it('keeps the other fields and the crop types when one field changes', async () => {
    mockFakes.getProfile.mockResolvedValue({ ...current, id: 'x', htx_code: 'TC', total_area_ha: 1 })
    expect(await a().execute({ field: 'address', value: 'Phổ Yên' }, manager, deps, NOW)).toBe('Đã cập nhật hồ sơ HTX.')
    expect(mockFakes.updateProfile).toHaveBeenCalledWith('TC', { ...current, address: 'Phổ Yên' })
  })

  it('refuses an invalid email with the route message', async () => {
    mockFakes.getProfile.mockResolvedValue(current)
    await expect(a().execute({ field: 'contact_email', value: 'không phải email' }, manager, deps, NOW)).rejects.toThrow('Email không hợp lệ')
    expect(mockFakes.updateProfile).not.toHaveBeenCalled()
  })
})
