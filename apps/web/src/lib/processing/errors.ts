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
}

export function processingErrorText(code: string | undefined, message: string | undefined, fallback: string): string {
  return message || (code && TEXT[code]) || fallback
}
