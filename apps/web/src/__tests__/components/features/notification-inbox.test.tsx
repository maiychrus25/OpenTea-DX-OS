// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { NotificationInbox } from '@/components/features/notification/NotificationInbox'

const empty = { data: { notifications: [], unreadCount: 0 } }

describe('NotificationInbox', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => empty }) as unknown as typeof fetch
  })

  it('NotificationInbox shows the empty state, not sample notices, when there is no notification', async () => {
    render(<SWRConfig value={{ provider: () => new Map() }}><NotificationInbox role="manager" /></SWRConfig>)
    expect(await screen.findByText('Chưa có thông báo nào')).toBeInTheDocument()
    expect(screen.queryByText('Mẫu')).not.toBeInTheDocument()
  })
})
