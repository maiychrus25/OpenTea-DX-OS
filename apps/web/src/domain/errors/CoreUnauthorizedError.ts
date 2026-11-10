// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export class CoreUnauthorizedError extends Error {
  // Next.js strips the message from server errors; digest is what reaches error.tsx.
  readonly digest = 'CORE_UNAUTHORIZED'

  constructor(message: string = 'No usable session for the core gateway') {
    super(message)
    this.name = 'CoreUnauthorizedError'
  }
}
