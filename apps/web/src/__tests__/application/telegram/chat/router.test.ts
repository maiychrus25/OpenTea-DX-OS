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
    ['sửa nhật ký hôm qua', { kind: 'action', name: 'journal.edit' }],
    ['rút nhật ký', { kind: 'action', name: 'journal.delete' }],
    ['duyệt báo cáo bệnh', { kind: 'action', name: 'disease.review' }],
    ['bắt đầu lứa mới', { kind: 'action', name: 'round.start' }],
    ['đặt ngày thu hoạch', { kind: 'action', name: 'harvest.schedule' }],
    ['tạo lô hàng', { kind: 'action', name: 'lot.create' }],
    ['xuất mã QR', { kind: 'action', name: 'lot.export_qr' }],
    ['gửi thông báo cho cả HTX', { kind: 'action', name: 'notification.announce' }],
    ['đánh dấu đã đọc', { kind: 'action', name: 'notification.read' }],
    ['xoá thông báo', { kind: 'action', name: 'notification.clear' }],
    ['mời thành viên', { kind: 'action', name: 'member.invite' }],
    ['duyệt thành viên', { kind: 'action', name: 'member.approve' }],
    ['xoá thành viên', { kind: 'action', name: 'member.remove' }],
    ['sửa hồ sơ HTX', { kind: 'action', name: 'profile.edit' }],
    ['thêm nông hộ', { kind: 'action', name: 'household.add' }],
    ['sửa nông hộ', { kind: 'action', name: 'household.edit' }],
    ['xoá thửa', { kind: 'action', name: 'parcel.delete' }],
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

describe('routeText: the issue #80 read tools', () => {
  test.each([
    ['tìm trà Shan', { kind: 'tool', name: 'search', args: { query: 'trà Shan' } }],
    ['chứng nhận TC-CHE-20261110-001', { kind: 'tool', name: 'certificate', args: { lot_code: 'TC-CHE-20261110-001' } }],
    ['đất thửa P-TC-001', { kind: 'tool', name: 'soil', args: { parcel_code: 'P-TC-001' } }],
    ['Ảnh thửa p-tc-002?', { kind: 'tool', name: 'photo', args: { parcel_code: 'p-tc-002' } }],
    ['hộ Nguyễn Văn An', { kind: 'tool', name: 'households', args: { name: 'Nguyễn Văn An' } }],
    ['nông hộ', { kind: 'tool', name: 'households' }],
    ['thành viên', { kind: 'tool', name: 'members' }],
    ['báo cáo bệnh', { kind: 'tool', name: 'diseases' }],
    ['hồ sơ của tôi', { kind: 'tool', name: 'profile' }],
    ['tài liệu', { kind: 'tool', name: 'documents' }],
    ['đối tác', { kind: 'tool', name: 'partners' }],
    ['đất thửa', { kind: 'tool', name: 'soil' }],
  ])('%s', (text, expected) => {
    expect(routeText(text)).toEqual(expected)
  })

  test('tìm and hộ route only at the start of a sentence; báo bệnh and báo cáo bệnh stay apart', () => {
    expect(routeText('giúp tôi tìm thửa nào ẩm nhất')).toBeNull()
    expect(routeText('cho hộ nhà tôi biết')).toBeNull()
    expect(routeText('tôi muốn báo bệnh')).toEqual({ kind: 'action', name: 'disease.report' })
  })
})

