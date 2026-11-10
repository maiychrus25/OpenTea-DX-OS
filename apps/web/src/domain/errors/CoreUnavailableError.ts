// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export class CoreUnavailableError extends Error {
  // Next.js strips the message from server errors; digest is what reaches error.tsx.
  readonly digest = 'CORE_UNAVAILABLE'

  constructor(message: string = 'Dịch vụ dữ liệu đang tạm gián đoạn. Vui lòng thử lại sau.') {
    super(message)
    this.name = 'CoreUnavailableError'
  }
}
