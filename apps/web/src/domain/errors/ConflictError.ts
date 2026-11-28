// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { DomainError } from './DomainError'

/** A request that is valid but clashes with the current state; answered 409 with its own code and extra fields. */
export class ConflictError extends DomainError {
  constructor(readonly code: string, message: string, readonly details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ConflictError'
  }
}
