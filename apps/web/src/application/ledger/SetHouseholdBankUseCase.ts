// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import type { LedgerPort } from '@/domain/ledger/ports/LedgerPort'
import { bankByBin, maskAccount } from '@/domain/payment/vietqr'

/** Stores the payout account of a household. The answer shows only the masked number; nothing here is logged. */
export class SetHouseholdBankUseCase {
  constructor(private readonly port: LedgerPort) {}

  async execute(actor: { role: string; htxProfileId: string }, householdId: string, input: { bank_bin: string; bank_account: string; bank_account_name: string }) {
    if (actor.role !== 'manager' && actor.role !== 'accountant') throw new ForbiddenError('Forbidden')
    const bank = bankByBin(input.bank_bin)
    if (!bank) throw new ValidationError('Ngân hàng không có trong danh sách.')
    const saved = await this.port.setBank(actor.htxProfileId, householdId, { bin: bank.bin, account: input.bank_account, accountName: input.bank_account_name })
    if (!saved) throw new NotFoundError('Không tìm thấy hộ')
    return { bank_bin: bank.bin, bank_name: bank.name, account_masked: maskAccount(input.bank_account), bank_account_name: input.bank_account_name }
  }
}
