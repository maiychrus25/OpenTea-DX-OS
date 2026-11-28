// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Vietnamese text for every processing error code of the contract; the server's own message wins when it sent one. */
const TEXT: Record<string, string> = {
  BATCH_NOT_OPEN: 'Mẻ đã hoàn thành hoặc đã huỷ, không sửa được nữa.',
  TICKETS_CHANGED: 'Có phiếu đã bị huỷ hoặc đã vào mẻ khác. Tải lại danh sách rồi thử lại.',
  BATCH_EMPTY: 'Mẻ cần ít nhất một phiếu cân và một dòng sản lượng trước khi hoàn thành.',
  DEVIATION_NOTE_REQUIRED: 'Tỷ lệ nằm ngoài khoảng chuẩn. Nhập giải trình (ít nhất 10 ký tự) để hoàn thành mẻ.',
  TICKET_IN_BATCH: 'Phiếu đã vào mẻ sao. Bỏ phiếu khỏi mẻ trước khi huỷ.',
  NOT_FOUND: 'Không tìm thấy mẻ này.',
  STOCK_CHANGED: 'Tồn chè khô vừa thay đổi vì một lô khác đã lấy. Bảng đã được tải lại với tồn mới.',
  WITHDRAWAL_NOT_PASSED: 'Có phiếu cân nguồn còn trong thời gian cách ly nên chưa đóng được lô.',
  GRADE_MISMATCH: 'Có dòng tồn không cùng hạng với lô đang đóng.',
  LOT_WITHOUT_BATCH: 'Lô chưa có nguồn từ mẻ sao sấy nên chưa xuất được QR.',
  CERTIFICATE_NOT_VALID: 'Có chứng nhận đã hết hạn hoặc đã thu hồi. Bỏ chọn chứng nhận đó rồi xuất lại.',
  CERTIFICATE_REVOKED: 'Chứng nhận này đã được thu hồi trước đó.',
  FILE_TOO_LARGE: 'Tệp vượt quá 10 MB.',
  FILE_TYPE: 'Chỉ nhận tệp PDF, JPG hoặc PNG.',
  VALIDATION_ERROR: 'Kiểm tra lại các trường đã nhập.',
}

export function processingErrorText(code: string | undefined, message: string | undefined, fallback: string): string {
  return message || (code && TEXT[code]) || fallback
}
