// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** A domain message without its leading machine code (`WITHDRAWAL_NOT_PASSED: …`), for display; the API keeps the code. */
export function withoutErrorCode(message: string): string {
  return message.replace(/^[A-Z_]+:\s*/, '')
}
