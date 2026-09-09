// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import {
  validatePhone,
  validatePin,
  validatePinMatch,
  validateFullName,
  getAuthErrorMessage,
  isAccountLocked,
  AUTH_ERROR_MESSAGES,
} from '@/lib/auth-validation'

// ─── 8.10-UNIT-001: phone/PIN validation và field errors ──────────────────────
describe('validatePhone', () => {
  it('trả về lỗi khi SĐT rỗng', () => {
    expect(validatePhone('')).toBe('Vui lòng nhập số điện thoại')
    expect(validatePhone('   ')).toBe('Vui lòng nhập số điện thoại')
  })

  it('trả về null khi SĐT VN hợp lệ bắt đầu bằng 0', () => {
    expect(validatePhone('0901234567')).toBeNull()
    expect(validatePhone('0337654321')).toBeNull()
    expect(validatePhone('0796543210')).toBeNull()
  })

  it('trả về null khi SĐT bắt đầu bằng +84', () => {
    expect(validatePhone('+84901234567')).toBeNull()
  })

  it('trả về lỗi khi SĐT sai định dạng', () => {
    expect(validatePhone('12345')).not.toBeNull()
    expect(validatePhone('abcdefghij')).not.toBeNull()
    expect(validatePhone('0001234567')).not.toBeNull() // prefix 00x không hợp lệ
  })
})

describe('validatePin', () => {
  it('trả về lỗi khi PIN rỗng', () => {
    expect(validatePin('')).toBe('Vui lòng nhập mã PIN')
    expect(validatePin('   ')).toBe('Vui lòng nhập mã PIN')
  })

  it('trả về null khi PIN đúng 6 chữ số', () => {
    expect(validatePin('123456')).toBeNull()
    expect(validatePin('000000')).toBeNull()
    expect(validatePin('999999')).toBeNull()
  })

  it('trả về lỗi khi PIN không đủ 6 số', () => {
    expect(validatePin('12345')).toBe('Mã PIN phải đúng 6 chữ số')
    expect(validatePin('1234567')).toBe('Mã PIN phải đúng 6 chữ số')
    expect(validatePin('12a456')).toBe('Mã PIN phải đúng 6 chữ số')
  })
})

describe('validatePinMatch', () => {
  it('trả về lỗi khi confirm rỗng', () => {
    expect(validatePinMatch('123456', '')).toBe('Vui lòng xác nhận mã PIN')
  })

  it('trả về lỗi khi PIN không khớp', () => {
    expect(validatePinMatch('123456', '654321')).toBe('Mã PIN không khớp')
  })

  it('trả về null khi PIN khớp', () => {
    expect(validatePinMatch('123456', '123456')).toBeNull()
  })
})

describe('validateFullName', () => {
  it('trả về lỗi khi tên rỗng', () => {
    expect(validateFullName('')).toBe('Vui lòng nhập họ tên')
    expect(validateFullName('  ')).toBe('Vui lòng nhập họ tên')
  })

  it('trả về lỗi khi tên < 2 ký tự', () => {
    expect(validateFullName('A')).toBe('Họ tên phải có ít nhất 2 ký tự')
  })

  it('trả về null khi tên hợp lệ', () => {
    expect(validateFullName('Nguyễn Văn An')).toBeNull()
    expect(validateFullName('An')).toBeNull()
  })
})

// ─── 8.10-UNIT-002: login error/lock/retry states (message mapping) ───────────
describe('getAuthErrorMessage', () => {
  it('trả về null khi không có error', () => {
    expect(getAuthErrorMessage(null)).toBeNull()
  })

  it('trả về thông báo tiếng Việt cho wrong-pin', () => {
    expect(getAuthErrorMessage('wrong-pin')).toBe('Sai mã PIN. Vui lòng thử lại.')
  })

  it('trả về thông báo tiếng Việt cho locked', () => {
    expect(getAuthErrorMessage('locked')).toBe(
      'Tài khoản đã bị khóa do nhập sai PIN quá nhiều lần.'
    )
  })

  it('trả về thông báo tiếng Việt cho unavailable', () => {
    expect(getAuthErrorMessage('unavailable')).toBe(
      'Hệ thống xác thực tạm thời không khả dụng. Vui lòng thử lại sau.'
    )
  })

  it('trả về thông báo tiếng Việt cho invalid-phone', () => {
    expect(getAuthErrorMessage('invalid-phone')).toBe(
      'Số điện thoại không hợp lệ hoặc chưa đăng ký.'
    )
  })

  it('trả về fallback message cho unknown error code', () => {
    expect(getAuthErrorMessage('some-unknown-code')).toBe(
      'Đăng nhập thất bại. Vui lòng thử lại.'
    )
  })

  it('cover tất cả known error codes trong AUTH_ERROR_MESSAGES', () => {
    const knownCodes = Object.keys(AUTH_ERROR_MESSAGES)
    knownCodes.forEach((code) => {
      const msg = getAuthErrorMessage(code)
      expect(msg).not.toBeNull()
      expect(typeof msg).toBe('string')
    })
  })
})

describe('isAccountLocked', () => {
  it('trả về true chỉ khi error code là "locked"', () => {
    expect(isAccountLocked('locked')).toBe(true)
    expect(isAccountLocked('wrong-pin')).toBe(false)
    expect(isAccountLocked(null)).toBe(false)
    expect(isAccountLocked('LOCKED')).toBe(false) // case-sensitive
  })
})
