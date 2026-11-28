// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Vietnamese text for every sales error code of the contract; the server's own message wins when it sent one. */
const TEXT: Record<string, string> = {
  LOT_STOCK_SHORT: 'Lô không còn đủ chè để bán theo số kg này.',
  LOT_NOT_SELLABLE: 'Lô này chưa sẵn sàng để bán.',
  OVERPAYMENT: 'Số tiền ghi thu vượt quá số còn phải thu của đơn.',
  ORDER_CANCELLED: 'Đơn đã huỷ, không sửa được nữa.',
  ORDER_PAID: 'Đơn đã thu đủ tiền, không đổi hạn thanh toán được.',
  ORDER_HAS_PAYMENTS: 'Đơn đã có khoản thu tiền, không huỷ được.',
  NOT_WHOLESALE: 'Chỉ đơn bán sỉ mới có hạn thanh toán.',
  NOT_FOUND: 'Không tìm thấy đơn này.',
  FORBIDDEN: 'Bạn không có quyền làm việc này.',
}

export function salesErrorText(code: string | undefined, message: string | undefined, fallback: string): string {
  return message || (code && TEXT[code]) || fallback
}
