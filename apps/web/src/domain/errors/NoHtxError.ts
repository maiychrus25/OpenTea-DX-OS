// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForbiddenError } from './ForbiddenError'

export class NoHtxError extends ForbiddenError {
  // Next.js strips the message from server errors; digest is what reaches error.tsx.
  readonly digest = 'NO_HTX'

  constructor(message: string = 'Tài khoản chưa được gán Hợp tác xã') {
    super(message)
    this.name = 'NoHtxError'
  }
}
