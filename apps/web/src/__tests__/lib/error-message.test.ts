// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { withoutErrorCode } from '@/lib/api/error-message'

describe('withoutErrorCode', () => {
  it('drops the leading machine code of a domain message', () => {
    expect(withoutErrorCode('WITHDRAWAL_NOT_PASSED: Thửa đất TC-A3 chưa qua thời gian cách ly.')).toBe('Thửa đất TC-A3 chưa qua thời gian cách ly.')
  })

  it('keeps a message without a code', () => {
    expect(withoutErrorCode('Lỗi tạo lô hàng')).toBe('Lỗi tạo lô hàng')
    expect(withoutErrorCode('Thửa TC-A2: chưa thu hoạch')).toBe('Thửa TC-A2: chưa thu hoạch')
  })
})
