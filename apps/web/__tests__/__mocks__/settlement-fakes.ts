// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { HouseholdSlips, NewLedgerEntry, NewLine, PayoutOutcome, PeriodRecord, SettlementPort, SettlementUnit, SlipSource } from '@/domain/ledger/ports/SettlementPort'
import type { LedgerEntryType, LedgerEntryView, LineView, PeriodView } from '@/domain/ledger/views'

export const NOW = new Date('2026-11-28T03:00:00Z') // 10:00 on 2026-11-28 in Vietnam
export const staff = { userId: 'acc-1', role: 'accountant', htxProfileId: 'htx-tc', htxCode: 'TC', userName: 'Kế toán A' }
export const manager = { ...staff, userId: 'mgr-1', role: 'manager', userName: 'Trưởng HTX' }

interface Slip { id: string; household_id: string; day: string; status: 'VALID' | 'VOIDED'; settlement_id: string | null; tenths?: number; amount: bigint }
interface Entry { household_id: string; entry_type: LedgerEntryType; amount_vnd: bigint; settlement_id: string | null }
interface Line { id: string; period_id: string; household_id: string; leaf_net_kg: string; leaf_amount_vnd: bigint; advances_vnd: bigint; debt_in_vnd: bigint; payable_vnd: bigint; debt_out_vnd: bigint; paid_at: Date | null; method: string | null; ref: string | null }
interface Period extends PeriodRecord { created_by_name: string | null; closed_by_name: string | null; closed_at: string | null }

/**
 * An in-memory settlement port that keeps the same state a database would: periods, slips, lines and the ledger.
 * A transaction that throws is rolled back, so a refused close leaves every table as it was.
 */
export class FakeSettlementPort implements SettlementPort {
  names: Record<string, string> = { 'hh-1': 'Hộ A', 'hh-2': 'Hộ B', 'hh-3': 'Hộ C' }
  banks: Record<string, { bin: string; account: string; name: string; keycloak: string | null }> = {}
  periods: Period[] = []
  tickets: Slip[] = []
  advances: Slip[] = []
  lines: Line[] = []
  ledger: Entry[] = []
  private tail: Promise<unknown> = Promise.resolve()
  private seq = 0

  ticket(household_id: string, day: string, amount: number, tenths = 100) { this.tickets.push({ id: `t-${this.tickets.length + 1}`, household_id, day, status: 'VALID', settlement_id: null, tenths, amount: BigInt(amount) }) }
  advance(household_id: string, day: string, amount: number) { this.advances.push({ id: `a-${this.advances.length + 1}`, household_id, day, status: 'VALID', settlement_id: null, amount: BigInt(amount) }) }

  balance(householdId: string): bigint { return this.ledger.filter((e) => e.household_id === householdId).reduce((s, e) => s + e.amount_vnd, BigInt(0)) }
  unpaid(householdId: string): bigint { return this.lines.filter((l) => l.household_id === householdId && !l.paid_at).reduce((s, l) => s + l.payable_vnd, BigInt(0)) }

  private outstanding(householdId: string) { return this.balance(householdId) - this.unpaid(householdId) }

  private slips(dateTo: string): HouseholdSlips[] {
    const byHousehold = new Map<string, HouseholdSlips>()
    const row = (id: string): HouseholdSlips => {
      if (!byHousehold.has(id)) {
        const bank = this.banks[id]
        byHousehold.set(id, { household_id: id, household_name: this.names[id] ?? id, has_bank_account: Boolean(bank), leaf_net_kg: '0.0', leaf_vnd: BigInt(0), advances_vnd: BigInt(0), outstanding_vnd: this.outstanding(id), ticket_ids: [], advance_ids: [] })
      }
      return byHousehold.get(id)!
    }
    for (const t of this.tickets.filter((x) => x.status === 'VALID' && !x.settlement_id && x.day <= dateTo)) {
      const r = row(t.household_id)
      r.leaf_vnd += t.amount
      r.leaf_net_kg = ((Math.round(Number(r.leaf_net_kg) * 10) + (t.tenths ?? 0)) / 10).toFixed(1)
      r.ticket_ids.push(t.id)
    }
    for (const a of this.advances.filter((x) => x.status === 'VALID' && !x.settlement_id && x.day <= dateTo)) {
      const r = row(a.household_id)
      r.advances_vnd += a.amount
      r.advance_ids.push(a.id)
    }
    return Array.from(byHousehold.values())
  }

  private view(l: Line): LineView {
    return {
      id: l.id, period_id: l.period_id, household_id: l.household_id, household_name: this.names[l.household_id], leaf_net_kg: Number(l.leaf_net_kg), leaf_amount_vnd: l.leaf_amount_vnd.toString(),
      advances_vnd: l.advances_vnd.toString(), debt_in_vnd: l.debt_in_vnd.toString(), payable_vnd: l.payable_vnd.toString(), debt_out_vnd: l.debt_out_vnd.toString(),
      paid_at: l.paid_at?.toISOString() ?? null, payment_method: l.method as LineView['payment_method'], payment_ref: l.ref, has_bank_account: Boolean(this.banks[l.household_id]),
    }
  }

  private periodView(p: Period): PeriodView {
    return { id: p.id, code: p.code, date_from: p.date_from, date_to: p.date_to, status: p.status, created_by_name: p.created_by_name, closed_by_name: p.closed_by_name, closed_at: p.closed_at }
  }

  inTransaction<T>(_ctx: { htxProfileId: string; htxCode: string; actorId: string }, work: (unit: SettlementUnit) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const snapshot = structuredClone({ periods: this.periods, tickets: this.tickets, advances: this.advances, lines: this.lines, ledger: this.ledger })
      try {
        await Promise.resolve()
        return await work(this.unit())
      } catch (err) {
        Object.assign(this, snapshot)
        throw err
      }
    })
    this.tail = run.catch(() => undefined)
    return run
  }

  private unit(): SettlementUnit {
    return {
      lastPeriod: async () => [...this.periods].sort((a, b) => b.date_to.localeCompare(a.date_to))[0] ?? null,
      hasDraft: async () => this.periods.some((p) => p.status === 'DRAFT'),
      earliestUnsettledDay: async () => [...this.tickets, ...this.advances].filter((s) => s.status === 'VALID' && !s.settlement_id).map((s) => s.day).sort()[0] ?? null,
      insertPeriod: async (i) => {
        const p: Period = { id: `p-${this.periods.length + 1}`, code: i.code, date_from: i.dateFrom, date_to: i.dateTo, status: 'DRAFT', created_by_name: i.createdByName, closed_by_name: null, closed_at: null }
        this.periods.push(p)
        return this.periodView(p)
      },
      lockPeriod: async (_h, id) => this.periods.find((p) => p.id === id) ?? null,
      collect: async (_h, dateTo) => this.slips(dateTo),
      createLine: async (l: NewLine) => {
        const id = `l-${++this.seq}`
        this.lines.push({ id, period_id: l.period_id, household_id: l.household_id, leaf_net_kg: l.leaf_net_kg, leaf_amount_vnd: l.leaf_amount_vnd, advances_vnd: l.advances_vnd, debt_in_vnd: l.debt_in_vnd, payable_vnd: l.payable_vnd, debt_out_vnd: l.debt_out_vnd, paid_at: null, method: null, ref: null })
        for (const t of this.tickets) if (l.ticket_ids.includes(t.id)) t.settlement_id = id
        for (const a of this.advances) if (l.advance_ids.includes(a.id)) a.settlement_id = id
        return id
      },
      addEntries: async (_h, _u, entries: NewLedgerEntry[]) => { for (const e of entries) this.ledger.push({ household_id: e.household_id, entry_type: e.entry_type, amount_vnd: e.amount_vnd, settlement_id: e.settlement_id }) },
      closePeriod: async (id, by, at) => { const p = this.periods.find((x) => x.id === id)!; p.status = 'CLOSED'; p.closed_by_name = by.name; p.closed_at = at.toISOString() },
    }
  }

  async listPeriods() { return this.periods.map((p) => this.periodView(p)) }
  async getPeriod(_h: string, id: string) { const p = this.periods.find((x) => x.id === id); return p ? { ...this.periodView(p), record: p } : null }
  async closedLines(_h: string, periodId: string) { return this.lines.filter((l) => l.period_id === periodId).map((l) => this.view(l)) }
  async preview(_h: string, dateTo: string) { return this.slips(dateTo) }

  async payLine(i: { lineId: string; periodId: string; method: string; ref: string | null; at: Date; userId: string }): Promise<PayoutOutcome> {
    return (this.tail = this.tail.then(async () => {
      const line = this.lines.find((l) => l.id === i.lineId && l.period_id === i.periodId)
      if (!line) return { kind: 'not_found' } as const
      if (line.payable_vnd === BigInt(0)) return { kind: 'nothing_to_pay' } as const
      await Promise.resolve() // a gap where an unconditional second writer would also pass
      if (line.paid_at) return { kind: 'already_paid' } as const
      line.paid_at = i.at
      line.method = i.method
      line.ref = i.ref
      this.ledger.push({ household_id: line.household_id, entry_type: 'PAYOUT', amount_vnd: -line.payable_vnd, settlement_id: line.id })
      return { kind: 'paid', line: this.view(line) } as const
    })) as Promise<PayoutOutcome>
  }

  slip: SlipSource | null = null
  async slipSource() { return this.slip }

  async addAdjustment(i: { householdId: string; amountVnd: bigint; reason: string }): Promise<LedgerEntryView | null> {
    if (!this.names[i.householdId]) return null
    this.ledger.push({ household_id: i.householdId, entry_type: 'ADJUSTMENT', amount_vnd: i.amountVnd, settlement_id: null })
    return { id: `e-${this.ledger.length}`, household_id: i.householdId, entry_type: 'ADJUSTMENT', amount_vnd: i.amountVnd.toString(), note: i.reason, ticket_id: null, advance_id: null, settlement_id: null, created_at: NOW.toISOString() }
  }
}
