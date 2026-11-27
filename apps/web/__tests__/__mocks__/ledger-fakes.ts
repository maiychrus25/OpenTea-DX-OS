// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { AdvanceUnit, AdvanceVoidOutcome, InputItemPatch, InputPort, NewAdvance, NewInputItem } from '@/domain/ledger/ports/InputPort'
import type { AdvanceView, InputItemView } from '@/domain/ledger/views'

export const NOW = new Date('2026-11-28T03:00:00Z') // 10:00 on 2026-11-28 in Vietnam
export const accountant = { userId: 'acc-1', role: 'accountant', htxProfileId: 'htx-tc', htxCode: 'TC', userName: 'Kế toán A' }
export const manager = { ...accountant, userId: 'mgr-1', role: 'manager', userName: 'Trưởng HTX' }

/** An in-memory input port. Transactions run one at a time, as the numbering lock makes them. */
export class FakeInputPort implements InputPort {
  items: InputItemView[] = [
    { id: 'item-1', name: 'Phân NPK', unit: 'bao', unit_price_vnd: 450000, kind: 'FERTILIZER', pesticide_product_id: null, active: true },
    { id: 'item-2', name: 'Catex 3.6EC', unit: 'chai', unit_price_vnd: 80000, kind: 'PESTICIDE', pesticide_product_id: 'catex', active: true },
  ]
  advances: AdvanceView[] = []
  households = [{ id: 'hh-1', name: 'Hộ A' }]
  pesticides = ['catex']
  voidOutcome: AdvanceVoidOutcome = { kind: 'not_found' }
  private tail: Promise<unknown> = Promise.resolve()

  async listItems() { return this.items }
  async itemByName(_h: string, name: string) { return this.items.find((i) => i.name === name) ?? null }
  async itemById(_h: string, id: string) { return this.items.find((i) => i.id === id) ?? null }
  async createItem(_h: string, data: NewInputItem) {
    const item: InputItemView = { id: `item-${this.items.length + 1}`, active: true, ...data }
    this.items.push(item)
    return item
  }
  async updateItem(_h: string, id: string, patch: InputItemPatch) {
    const item = this.items.find((i) => i.id === id)
    if (!item) return null
    Object.assign(item, patch)
    return item
  }
  async pesticideExists(id: string) { return this.pesticides.includes(id) }

  inAdvanceTransaction<T>(work: (unit: AdvanceUnit) => Promise<T>): Promise<T> {
    const run = this.tail.then(() => work(this.unit()))
    this.tail = run.catch(() => undefined)
    return run
  }

  private unit(): AdvanceUnit {
    return {
      householdOf: async (htx, id) => (htx === 'htx-tc' ? this.households.find((h) => h.id === id) ?? null : null),
      itemOf: async (htx, id) => (htx === 'htx-tc' ? this.items.find((i) => i.id === id) ?? null : null),
      nextAdvanceNo: async (code, day) => {
        await Promise.resolve() // a gap where an unlocked second writer would read the same count
        return `${code}-VT-${day.replace(/-/g, '')}-${String(this.advances.length + 1).padStart(3, '0')}`
      },
      insert: async (a: NewAdvance) => {
        const item = this.items.find((i) => i.id === a.item_id)!
        const view: AdvanceView = {
          id: `adv-${this.advances.length + 1}`, advance_no: a.advance_no, household_id: a.household_id, household_name: 'Hộ A',
          item_id: a.item_id, item_name: item.name, unit: item.unit, quantity: a.quantity, unit_price_vnd: a.unit_price_vnd,
          amount_vnd: a.amount_vnd.toString(), advanced_on: a.advanced_on, status: 'VALID', void_reason: null, settlement_id: null,
        }
        ;(view as AdvanceView & { client_id?: string | null }).client_id = a.client_id
        this.advances.push(view)
        return view
      },
    }
  }

  async findAdvanceByClientId(_u: string, clientId: string) {
    return this.advances.find((a) => (a as AdvanceView & { client_id?: string | null }).client_id === clientId) ?? null
  }
  async voidAdvance() { return this.voidOutcome }
  async listAdvances() { return { data: this.advances, next_cursor: null, totals: { amount_vnd: '0' } } }
  async listAdvancesRange() { return this.advances }
}
