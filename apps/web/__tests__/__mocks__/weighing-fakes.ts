// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { SprayEntry } from '@/domain/journal/blocking-sprays'
import type { FreshLeafTicketPort, NewTicket, TicketUnit, TicketView, VoidOutcome } from '@/domain/weighing/ports/FreshLeafTicketPort'

export const NOW = new Date('2026-11-28T03:00:00Z') // 10:00 on 2026-11-28 in Vietnam
export const actor = { userId: 'acc-1', role: 'accountant', htxProfileId: 'htx-tc', htxCode: 'TC' }
export const input = { household_id: 'hh-1', parcel_id: 'p-1', grade_id: 'g-1', gross_kg: 100, deduction_pct: 5 }

export const spray = (status: string, safe: string, entryDate = '2026-11-20T00:00:00Z', cycleId: string | null = 'cycle-1'): SprayEntry => ({
  status,
  entry_date: entryDate,
  cycle_id: cycleId,
  activities: [{ safe_harvest_date: safe }],
})

/** An in-memory ticket port. Transactions run one at a time, as the parcel row lock makes them. */
export class FakeTicketPort implements FreshLeafTicketPort {
  sprays: SprayEntry[] = []
  parcel = { id: 'p-1', parcel_code: 'TC-A1', status: 'TENDING', household_id: 'hh-1', htx_profile_id: 'htx-tc' as string | null }
  grade = { id: 'g-1', name: 'Loại 1', active: true }
  price: number | null = 15000
  tickets: TicketView[] = []
  insertFailure: unknown = null
  voidOutcome: VoidOutcome = { kind: 'not_found' }
  locked = 0
  private tail: Promise<unknown> = Promise.resolve()

  inTicketTransaction<T>(work: (unit: TicketUnit) => Promise<T>): Promise<T> {
    const run = this.tail.then(() => work(this.unit()))
    this.tail = run.catch(() => undefined)
    return run
  }

  private unit(): TicketUnit {
    return {
      lockParcel: async (id) => { this.locked += 1; return id === this.parcel.id ? { ...this.parcel } : null },
      sprayEntries: async () => this.sprays,
      gradeOf: async (htx, id) => (id === this.grade.id && htx === 'htx-tc' ? this.grade : null),
      priceOf: async () => this.price,
      cycleIdFor: async () => 'cycle-1',
      nextTicketNo: async (code, day) => {
        await Promise.resolve() // a gap where an unlocked second writer would read the same count
        return `${code}-PC-${day.replace(/-/g, '')}-${String(this.tickets.length + 1).padStart(3, '0')}`
      },
      insert: async (t: NewTicket) => {
        if (this.insertFailure) throw this.insertFailure
        const view: TicketView = {
          id: `t-${this.tickets.length + 1}`, ticket_no: t.ticket_no, household_id: t.household_id, household_name: 'Hộ A',
          parcel_id: t.parcel_id, parcel_code: 'TC-A1', cycle_id: t.cycle_id, grade_id: t.grade_id, grade_name: 'Loại 1',
          weighed_at: t.weighed_at.toISOString(), gross_kg: t.gross_kg, deduction_pct: t.deduction_pct, net_kg: t.net_kg,
          price_vnd_per_kg: t.price_vnd_per_kg, amount_vnd: t.amount_vnd.toString(), status: 'VALID', void_reason: null, settlement_id: null,
        }
        this.tickets.push(view)
        return view
      },
    }
  }

  async findByClientId(_u: string, clientId: string) { return this.tickets.find((t) => t.id === clientId) ?? null }
  async voidTicket() { return this.voidOutcome }
  async parcelOf() { return null }
  async sprayEntries() { return this.sprays }
  async get() { return null }
  async list() { return { data: [], next_cursor: null, totals: { net_kg: 0, amount_vnd: '0' } } }
  async mine() { return [] }
  async listRange() { return [] }
  async searchHouseholds(): Promise<{ id: string; name: string; phone: string; parcels: { id: string; parcel_code: string }[] }[]> { return [] }
  async weighingSummary() { return { ticket_net_kg: 0, journal_fresh_leaf_kg: 0 } }
}
