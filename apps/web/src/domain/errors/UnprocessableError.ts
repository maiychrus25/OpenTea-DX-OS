// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { DomainError } from './DomainError'

/** A well-formed request the rules refuse; answered 422 with its own code and extra fields. */
export class UnprocessableError extends DomainError {
  constructor(readonly code: string, message: string, readonly details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'UnprocessableError'
  }
}
