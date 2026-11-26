// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { commandOf, routeText } from '@/application/telegram/chat/router'
import { normalizeText } from '@/application/telegram/chat/normalize'

describe('normalizeText', () => {
  test('folds case and marks, maps đ to d and pads with one space each side', () => {
    expect(normalizeText('  Duyệt   HẾT, nhật-ký!  ')).toBe(' duyet het nhat ky ')
    expect(normalizeText('Đề xuất')).toBe(' de xuat ')
  })
})

describe('routeText', () => {
  test.each([
    ['ghi nhật ký phun Regent 800WG', { kind: 'action', name: 'journal.create' }],
    ['tôi muốn báo bệnh lá', { kind: 'action', name: 'disease.report' }],
    ['duyệt thu hoạch thửa này', { kind: 'action', name: 'harvest.approve' }],
    ['duyệt hết nhật ký', { kind: 'action', name: 'journal.batch_approve' }],
    ['có việc nào cần duyệt không', { kind: 'tool', name: 'pending' }],
    ['hôm nay thời tiết thế nào', { kind: 'tool', name: 'weather' }],
    ['giá chè hôm nay', { kind: 'tool', name: 'market' }],
    ['tỷ giá', { kind: 'tool', name: 'market' }],
    ['có bản tin nào không', { kind: 'tool', name: 'bulletin' }],
    ['thông báo mới', { kind: 'tool', name: 'notifications' }],
    ['lịch thu hoạch tuần này', { kind: 'tool', name: 'harvest_schedule' }],
    ['danh sách thửa của tôi', { kind: 'tool', name: 'parcels' }],
    ['lô hàng đã bán', { kind: 'tool', name: 'lots' }],
    ['tóm tắt giúp tôi', { kind: 'tool', name: 'today' }],
    ['xem nhật ký', { kind: 'tool', name: 'journal' }],
  ])('%s', (text, expected) => {
    expect(routeText(text)).toEqual(expected)
  })

  test('the longest phrase wins, and a sentence with no phrase is not routed', () => {
    expect(routeText('thời tiết và giá chè')).toEqual({ kind: 'tool', name: 'weather' })
    expect(routeText('mai có nên đi hái không')).toBeNull()
    expect(routeText('xin chào')).toBeNull()
  })
})

describe('commandOf', () => {
  test('reads the command with or without a bot suffix, and ignores plain text', () => {
    expect(commandOf('/NhatKy')).toBe('/nhatky')
    expect(commandOf('/tomtat@OpenTeaBot')).toBe('/tomtat')
    expect(commandOf('/huy')).toBe('/huy')
    expect(commandOf('nhật ký /huy')).toBeNull()
  })
})
