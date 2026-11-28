// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ticketBlock } from '@/domain/processing/lot-sources'
import { sprayOf } from '../../../__tests__/__mocks__/lot-batch-fakes'

describe('ticketBlock', () => {
  it('lets a ticket weighed after the safe day go in', () => {
    expect(ticketBlock([sprayOf('2026-11-10', '2026-11-20')], '2026-11-27', 'cycle-1')).toBeNull()
  })

  it('does not block when the safe day is the weigh day itself', () => {
    expect(ticketBlock([sprayOf('2026-11-20', '2026-11-27T00:00:00+07:00')], '2026-11-27', 'cycle-1')).toBeNull()
  })

  it('blocks a ticket weighed before the safe day and names that day', () => {
    expect(ticketBlock([sprayOf('2026-11-25', '2026-11-30T00:00:00+07:00')], '2026-11-27', 'cycle-1')).toBe('2026-11-30')
  })

  it('blocks on a spraying entered after the weighing but dated before it (back-dated)', () => {
    // entry_date 2026-11-26 is on or before the weigh day 2026-11-27; the spray was only written down on the 28th.
    expect(ticketBlock([sprayOf('2026-11-26', '2026-12-02T00:00:00+07:00', 'cycle-2')], '2026-11-27', 'cycle-1')).toBe('2026-12-02')
  })

  it('does not let a spraying of the next flush done after the weighing lock the ticket', () => {
    expect(ticketBlock([sprayOf('2026-11-29', '2026-12-05T00:00:00+07:00', 'cycle-2')], '2026-11-27', 'cycle-1')).toBeNull()
  })

  it('takes the latest safe day and ignores drafts and rejected entries', () => {
    const entries = [sprayOf('2026-11-20', '2026-11-29T00:00:00+07:00'), sprayOf('2026-11-21', '2026-12-04T00:00:00+07:00'), sprayOf('2026-11-22', '2026-12-30T00:00:00+07:00', 'cycle-1', 'DRAFT')]
    expect(ticketBlock(entries, '2026-11-27', 'cycle-1')).toBe('2026-12-04')
  })
})
