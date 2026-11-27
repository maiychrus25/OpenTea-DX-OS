// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { DomainError } from './DomainError'

export class WithdrawalBelowFloorError extends DomainError {
  readonly floorDays: number

  constructor(floorDays: number) {
    super(`Thời gian cách ly không được thấp hơn ${floorDays} ngày (mức sàn của thuốc này).`)
    this.name = 'WithdrawalBelowFloorError'
    this.floorDays = floorDays
  }
}
