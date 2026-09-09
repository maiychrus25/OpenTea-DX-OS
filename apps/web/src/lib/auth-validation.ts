// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/**
 * Pure validation functions cho auth flows (mock-mode).
 * Không phụ thuộc vào React hay framework — dễ unit test.
 */

// Số điện thoại Việt Nam: bắt đầu bằng 0 hoặc +84, 9-10 số sau prefix
const VN_PHONE_REGEX = /^(0|\+84)(3[2-9]|5[6-9]|7[0|6-9]|8[0-9]|9[0-9])[0-9]{7}$/

/**
 * Kiểm tra số điện thoại VN hợp lệ
 * @returns null nếu hợp lệ, string error message nếu không hợp lệ
 */
export function validatePhone(phone: string): string | null {
  if (!phone.trim()) return 'Vui lòng nhập số điện thoại'
  if (!VN_PHONE_REGEX.test(phone.trim())) return 'Số điện thoại không đúng định dạng (VD: 0901234567)'
  return null
}

/**
 * Kiểm tra PIN đúng 6 chữ số
 * @returns null nếu hợp lệ, string error message nếu không hợp lệ
 */
export function validatePin(pin: string): string | null {
  if (!pin.trim()) return 'Vui lòng nhập mã PIN'
  if (!/^\d{6}$/.test(pin)) return 'Mã PIN phải đúng 6 chữ số'
  return null
}

/**
 * Kiểm tra PIN confirm khớp với PIN gốc
 * @returns null nếu hợp lệ, string error message nếu không khớp
 */
export function validatePinMatch(pin: string, confirmPin: string): string | null {
  if (!confirmPin.trim()) return 'Vui lòng xác nhận mã PIN'
  if (pin !== confirmPin) return 'Mã PIN không khớp'
  return null
}

/**
 * Kiểm tra tên hợp lệ (không rỗng, ít nhất 2 ký tự)
 */
export function validateFullName(name: string): string | null {
  if (!name.trim()) return 'Vui lòng nhập họ tên'
  if (name.trim().length < 2) return 'Họ tên phải có ít nhất 2 ký tự'
  return null
}

/**
 * Map Keycloak/NextAuth error codes sang Vietnamese error messages
 */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'Configuration': 'Không thể kết nối máy chủ xác thực.',
  'wrong-pin': 'Sai mã PIN. Vui lòng thử lại.',
  'invalid-phone': 'Số điện thoại không hợp lệ hoặc chưa đăng ký.',
  'locked': 'Tài khoản đã bị khóa do nhập sai PIN quá nhiều lần.',
  'unavailable': 'Hệ thống xác thực tạm thời không khả dụng. Vui lòng thử lại sau.',
  'retry': 'Phiên đăng nhập hết hạn. Vui lòng thử lại.',
  'OAuthSignin': 'Không thể kết nối tới hệ thống xác thực.',
  'OAuthCallback': 'Lỗi xác thực. Vui lòng thử lại.',
  'AccessDenied': 'Tài khoản của bạn không có quyền truy cập hệ thống này.',
}

/**
 * Lấy error message tiếng Việt từ error code
 */
export function getAuthErrorMessage(errorCode: string | null): string | null {
  if (!errorCode) return null
  return AUTH_ERROR_MESSAGES[errorCode] ?? 'Đăng nhập thất bại. Vui lòng thử lại.'
}

/**
 * Kiểm tra error code là "locked" → cần hiển thị recovery link
 */
export function isAccountLocked(errorCode: string | null): boolean {
  return errorCode === 'locked'
}
