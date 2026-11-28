// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import * as QRCode from 'qrcode'
import { ConflictError, DomainError, ForbiddenError, NotFoundError } from '@/domain/errors'
import type { ZaloEvent } from '@/domain/zalo/zalo-events'
import type { SettlementPort, SlipSource } from '@/domain/ledger/ports/SettlementPort'
import type { LedgerEntryView, LineView, PaymentMethod, PeriodView } from '@/domain/ledger/views'
import { bankByBin, maskAccount, payload, transferNote } from '@/domain/payment/vietqr'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { dong, raiseZaloEvents, type ZaloEventSink } from '@/application/zalo/zalo-events'
import { draftLines, settleSlips, totalsOf, type PeriodTotals } from './settlement-detail'

export interface SettlementActor {
  userId: string
  role: string
  htxProfileId: string
  htxCode: string
  userName?: string
}

export interface PeriodDetail {
  period: PeriodView
  lines: LineView[]
  totals: PeriodTotals
}

const isStaff = (actor: { role: string }) => actor.role === 'manager' || actor.role === 'accountant'
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const viDay = (day: string) => day.split('-').reverse().join('/')

export class ListSettlementsUseCase {
  constructor(private readonly port: SettlementPort) {}

  async execute(actor: SettlementActor): Promise<PeriodView[]> {
    if (!isStaff(actor)) throw new ForbiddenError('Forbidden')
    return this.port.listPeriods(actor.htxProfileId)
  }
}

/** The draft numbers while the period is open, the stored lines once it is closed. */
export class GetSettlementUseCase {
  constructor(private readonly port: SettlementPort) {}

  async execute(actor: SettlementActor, id: string): Promise<PeriodDetail> {
    if (!isStaff(actor)) throw new ForbiddenError('Forbidden')
    const found = await this.port.getPeriod(actor.htxProfileId, id)
    if (!found) throw new NotFoundError('Không tìm thấy kỳ quyết toán')
    const { record, ...period } = found
    const lines = record.status === 'CLOSED'
      ? await this.port.closedLines(actor.htxProfileId, id)
      : draftLines(id, await this.port.preview(actor.htxProfileId, record.date_to))
    return { period, lines, totals: totalsOf(lines) }
  }
}

/** Spec §7.4: periods are contiguous, end today at the latest, and there is one draft at a time. */
export class CreateSettlementPeriodUseCase {
  constructor(private readonly port: SettlementPort, private readonly clock: () => Date = () => new Date()) {}

  async execute(actor: SettlementActor, input: { date_from: string; date_to: string }): Promise<PeriodView> {
    if (!isStaff(actor)) throw new ForbiddenError('Forbidden')
    if (input.date_to > vnDayOf(this.clock())) throw new DomainError('Ngày kết thúc kỳ không được sau hôm nay.')

    return this.port.inTransaction({ htxProfileId: actor.htxProfileId, htxCode: actor.htxCode, actorId: actor.userId }, async (unit) => {
      if (await unit.hasDraft(actor.htxProfileId)) throw new DomainError('Còn một kỳ nháp chưa chốt. Chốt hoặc xử lý kỳ đó trước khi tạo kỳ mới.')
      const last = await unit.lastPeriod(actor.htxProfileId)
      if (last) {
        const next = addDays(last.date_to, 1)
        if (input.date_from < next) throw new DomainError(`Kỳ mới bị chồng ngày lên kỳ ${last.code}. Kỳ mới phải bắt đầu từ ${viDay(next)}.`)
        if (input.date_from > next) throw new DomainError(`Kỳ mới bị hở ngày. Kỳ mới phải bắt đầu đúng ${viDay(next)}.`)
      } else {
        const earliest = await unit.earliestUnsettledDay(actor.htxProfileId)
        if (earliest && earliest < input.date_from) throw new DomainError('Còn phiếu trước ngày bắt đầu kỳ.')
      }
      return unit.insertPeriod({
        htxProfileId: actor.htxProfileId,
        code: `${actor.htxCode}-QT-${input.date_to.replace(/-/g, '')}`,
        dateFrom: input.date_from,
        dateTo: input.date_to,
        createdById: actor.userId,
        createdByName: actor.userName ?? null,
      })
    })
  }
}

/**
 * Closes a period for the whole cooperative in one transaction. Only a manager calls it, and only from the route:
 * no agent and no schedule closes a period. A second call answers 409 and writes nothing.
 */
export class CloseSettlementPeriodUseCase {
  constructor(private readonly port: SettlementPort, private readonly clock: () => Date = () => new Date(), private readonly zalo?: ZaloEventSink) {}

  async execute(actor: SettlementActor, id: string, expected: { household_count: number; payable_total_vnd: string }): Promise<PeriodDetail> {
    if (actor.role !== 'manager') throw new ForbiddenError('Forbidden')

    await this.port.inTransaction({ htxProfileId: actor.htxProfileId, htxCode: actor.htxCode, actorId: actor.userId }, async (unit) => {
      const period = await unit.lockPeriod(actor.htxProfileId, id)
      if (!period) throw new NotFoundError('Không tìm thấy kỳ quyết toán')
      if (period.status === 'CLOSED') throw new ConflictError('PERIOD_CLOSED', 'Kỳ này đã chốt rồi.')

      const rows = await unit.collect(actor.htxProfileId, period.date_to)
      const settled = rows.map((row) => ({ row, result: settleSlips(row) }))
      const totals = totalsOf(draftLines(period.id, rows))
      if (totals.households !== expected.household_count || totals.payable_vnd !== expected.payable_total_vnd) {
        throw new ConflictError('PERIOD_CHANGED', 'Số liệu của kỳ đã thay đổi từ lúc bạn mở hộp xác nhận. Xem số mới rồi chốt lại.', { totals })
      }

      for (const { row, result } of settled) {
        const lineId = await unit.createLine({
          period_id: period.id,
          household_id: row.household_id,
          leaf_net_kg: row.leaf_net_kg,
          leaf_amount_vnd: row.leaf_vnd,
          advances_vnd: row.advances_vnd,
          debt_in_vnd: result.debtInVnd,
          payable_vnd: result.payableVnd,
          debt_out_vnd: result.debtOutVnd,
          ticket_ids: row.ticket_ids,
          advance_ids: row.advance_ids,
        })
        // Exactly two kinds of rows: the leaf credit and the input debit. Old debt is already in the balance.
        const zero = BigInt(0)
        await unit.addEntries(actor.htxProfileId, actor.userId, [
          ...(row.leaf_vnd > zero ? [{ household_id: row.household_id, entry_type: 'LEAF_CREDIT' as const, amount_vnd: row.leaf_vnd, settlement_id: lineId }] : []),
          ...(row.advances_vnd > zero ? [{ household_id: row.household_id, entry_type: 'INPUT_DEBIT' as const, amount_vnd: -row.advances_vnd, settlement_id: lineId }] : []),
        ])
      }
      await unit.closePeriod(period.id, { id: actor.userId, name: actor.userName ?? null }, this.clock())
    })

    const detail = await new GetSettlementUseCase(this.port).execute(actor, id)
    await raiseZaloEvents(this.zalo, settlementEvents(actor.htxCode, detail))
    return detail
  }
}

/** One message per closed line: the net pay or the debt and a link to the slip. Never a bank account. */
function settlementEvents(htxCode: string, detail: PeriodDetail): ZaloEvent[] {
  const base = process.env.DXOS_WEB_PUBLIC_URL?.trim().replace(/\/+$/, '')
  return detail.lines.flatMap((line) => {
    if (!line.id) return []
    const owes = BigInt(line.payable_vnd) === BigInt(0) && BigInt(line.debt_out_vnd) > BigInt(0)
    return [{
      kind: 'SETTLEMENT_CLOSED' as const,
      htxCode,
      eventId: line.id,
      householdId: line.household_id,
      params: {
        period_code: detail.period.code,
        result_label: owes ? 'Còn nợ' : 'Thực lĩnh',
        amount_vnd: dong(owes ? line.debt_out_vnd : line.payable_vnd),
        ...(base ? { slip_url: `${base}/farmer/settlements/${detail.period.id}/slip/${line.id}` } : {}),
      },
    }]
  })
}

/** Records that a line was paid. Only a line with a payable amount can be paid, and only once. */
export class RecordPayoutUseCase {
  constructor(private readonly port: SettlementPort, private readonly clock: () => Date = () => new Date()) {}

  async execute(actor: SettlementActor, periodId: string, lineId: string, input: { method: PaymentMethod; ref?: string }): Promise<LineView> {
    if (!isStaff(actor)) throw new ForbiddenError('Forbidden')
    const outcome = await this.port.payLine({
      htxProfileId: actor.htxProfileId,
      htxCode: actor.htxCode,
      periodId,
      lineId,
      method: input.method,
      ref: input.ref?.trim() || null,
      userId: actor.userId,
      at: this.clock(),
    })
    if (outcome.kind === 'not_found') throw new NotFoundError('Không tìm thấy dòng quyết toán')
    if (outcome.kind === 'nothing_to_pay') throw new ConflictError('NOTHING_TO_PAY', 'Không có khoản chi trả.')
    if (outcome.kind === 'already_paid') throw new ConflictError('ALREADY_PAID', 'Khoản này đã được ghi trả.')
    return outcome.line
  }
}

export class CreateLedgerAdjustmentUseCase {
  constructor(private readonly port: SettlementPort) {}

  async execute(actor: SettlementActor, input: { household_id: string; amount_vnd: string; reason: string }): Promise<LedgerEntryView> {
    if (actor.role !== 'manager') throw new ForbiddenError('Forbidden')
    const entry = await this.port.addAdjustment({
      htxProfileId: actor.htxProfileId,
      htxCode: actor.htxCode,
      householdId: input.household_id,
      amountVnd: BigInt(input.amount_vnd),
      reason: input.reason,
      userId: actor.userId,
    })
    if (!entry) throw new NotFoundError('Không tìm thấy hộ')
    return entry
  }
}

export interface Slip {
  htx: { name: string; code: string }
  household: { id: string; name: string }
  period: PeriodView
  tickets: SlipSource['tickets']
  advances: SlipSource['advances']
  line: LineView
  qr: { data_url: string; bank_name: string; account_masked: string; account_full?: string } | null
  transfer_note: string
}

const qrDataUrl = (text: string) => QRCode.toDataURL(text, { margin: 1, errorCorrectionLevel: 'M' })

/**
 * The slip of one line. Staff see the full account to make the transfer; a farmer reads only the slip of their own
 * household and gets the masked number. The account number is never logged.
 */
export class GetSettlementSlipUseCase {
  constructor(private readonly port: SettlementPort, private readonly makeQr: (text: string) => Promise<string> = qrDataUrl) {}

  async execute(actor: SettlementActor, periodId: string, lineId: string): Promise<Slip> {
    if (!isStaff(actor) && actor.role !== 'farmer') throw new ForbiddenError('Forbidden')
    const source = await this.port.slipSource(actor.htxProfileId, periodId, lineId)
    // A farmer asking for someone else's slip gets the same answer as for a slip that does not exist.
    if (!source || (actor.role === 'farmer' && source.household.keycloak_user_id !== actor.userId)) throw new NotFoundError('Không tìm thấy phiếu quyết toán')

    const { household, line, period } = source
    const note = transferNote(period.code, household.id)
    const payable = BigInt(line.payable_vnd)
    const bank = household.bank_bin ? bankByBin(household.bank_bin) : null
    let qr: Slip['qr'] = null
    if (bank && household.bank_account && payable > BigInt(0)) {
      qr = {
        data_url: await this.makeQr(payload(bank.bin, household.bank_account, payable, note)),
        bank_name: bank.name,
        account_masked: maskAccount(household.bank_account),
        ...(isStaff(actor) ? { account_full: household.bank_account } : {}),
      }
    }
    return {
      htx: source.htx,
      household: { id: household.id, name: household.name },
      period,
      tickets: source.tickets,
      advances: source.advances,
      line,
      qr,
      transfer_note: note,
    }
  }
}
