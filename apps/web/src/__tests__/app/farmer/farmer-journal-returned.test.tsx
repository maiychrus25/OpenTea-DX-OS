// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FarmerJournalList } from '@/app/farmer/journal/_components/FarmerJournalList'

const returnedEntry = {
  id: 'entry-1',
  entry_date: '2026-11-20T00:00:00.000Z',
  activity_type: 'SPRAYING',
  performed_by: 'Nông hộ A',
  status: 'REQUEST_CHANGES',
  notes: null,
  activities: [],
  review_note: 'Thiếu liều lượng thuốc',
}

describe('FarmerJournalList shows a returned entry', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [returnedEntry] }),
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  test('labels the entry as a change request and shows the reviewer note in the detail view', async () => {
    render(<FarmerJournalList />)

    const card = await screen.findByRole('button', { name: /Yêu cầu sửa/ })
    fireEvent.click(card)

    expect(screen.getByText('Yêu cầu sửa:')).toBeInTheDocument()
    expect(screen.getByText('Thiếu liều lượng thuốc')).toBeInTheDocument()
    expect(screen.queryByText('Lý do từ chối:')).not.toBeInTheDocument()
  })
})
