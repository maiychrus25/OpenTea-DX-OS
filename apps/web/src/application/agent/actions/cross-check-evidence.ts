// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { utcTimestamp } from '@/domain/agent/evidence'
import { milli } from './field-evidence'

// Evidence contract version 2, see platform/agent/tests/fixtures/evidence-vectors-cross-check.json.
// Money columns (unit price, amount, price per kg) are not part of the evidence.

/** A Prisma Decimal, a number or a numeric string: all read as the number the agent hashed. */
type Numeric = number | string | { toString(): string }

export interface EvidenceInputAdvance {
  id: string
  household_id: string
  item_id: string
  quantity: Numeric
  advanced_on: Date | string
  status: string
  settlement_id: string | null
}

export function advanceValues(advance: EvidenceInputAdvance): Record<string, unknown> {
  return {
    id: advance.id,
    household_id: advance.household_id,
    item_id: advance.item_id,
    quantity_milli: milli(Number(advance.quantity)),
    advanced_on: (advance.advanced_on instanceof Date ? advance.advanced_on.toISOString() : advance.advanced_on).slice(0, 10),
    status: advance.status,
    settlement_id: advance.settlement_id ?? null,
  }
}

export interface EvidenceFreshLeafTicket {
  id: string
  household_id: string
  parcel_id: string
  cycle_id: string | null
  weighed_at: Date | string
  net_kg: Numeric
  status: string
}

export function ticketValues(ticket: EvidenceFreshLeafTicket): Record<string, unknown> {
  return {
    id: ticket.id,
    household_id: ticket.household_id,
    parcel_id: ticket.parcel_id,
    cycle_id: ticket.cycle_id ?? null,
    weighed_at: utcTimestamp(ticket.weighed_at),
    net_kg_milli: milli(Number(ticket.net_kg)),
    status: ticket.status,
  }
}
