// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export class CoreUnauthorizedError extends Error {
  constructor(message: string = 'No usable session for the core gateway') {
    super(message)
    this.name = 'CoreUnauthorizedError'
  }
}
