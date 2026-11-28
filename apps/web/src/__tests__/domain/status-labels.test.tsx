// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { lotStatusLabel } from '@/domain/lot/lot-status-label'
import { diseaseStatusLabel } from '@/domain/disease/disease-status-label'

describe('lotStatusLabel', () => {
  it.each([
    ['DRAFT', 'Bản nháp'],
    ['READY', 'Sẵn sàng'],
    ['QR_EXPORTED', 'Đã xuất QR'],
  ])('%s → %s', (status, label) => expect(lotStatusLabel(status)).toBe(label))

  it('keeps an unknown status as it is', () => expect(lotStatusLabel('ARCHIVED')).toBe('ARCHIVED'))
})

describe('diseaseStatusLabel', () => {
  it.each([
    ['PENDING', 'Chờ duyệt', 'amber'],
    ['CONFIRMED', 'Đã xác nhận', 'green'],
    ['REJECTED', 'Bị từ chối', 'neutral'],
  ])('%s → %s', (status, label, tone) => expect(diseaseStatusLabel(status)).toEqual({ label, tone }))

  it('keeps an unknown status as it is', () => expect(diseaseStatusLabel('OTHER')).toEqual({ label: 'OTHER', tone: 'neutral' }))
})
