// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { DomainError } from '@/domain/errors'

/** The campaign is dropped, approved or done, so it no longer takes decisions (answered as 409 on the web). */
export class CampaignClosedError extends DomainError {
  constructor() {
    super('Chiến dịch đã được xử lý.')
    this.name = 'CampaignClosedError'
  }
}
