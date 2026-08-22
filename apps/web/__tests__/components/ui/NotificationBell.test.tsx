// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationBell } from '@/components/ui/NotificationBell'
import { SWRConfig } from 'swr'

// Mock fetch
global.fetch = jest.fn()

describe('NotificationBell Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  )

  it('TC-7.11-01: badge not visible when no unread notifications', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [] }),
    })

    render(<NotificationBell role="manager" />, { wrapper })
    
    // wait for SWR to fetch
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })
    
    expect(screen.queryByTestId('notif-badge')).not.toBeInTheDocument()
  })

  it('TC-7.11-02: badge shows unread count', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [
          { id: '1', title: 'Test', detail: 'Detail', tone: 'green', created_at: new Date().toISOString(), read: false },
          { id: '2', title: 'Test2', detail: 'Detail2', tone: 'amber', created_at: new Date().toISOString(), read: false },
        ],
      }),
    })

    render(<NotificationBell role="manager" />, { wrapper })
    
    const badge = await screen.findByTestId('notif-badge')
    expect(badge).toHaveTextContent('2')
  })

  it('TC-7.11-03: clicking bell opens notification panel', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [] }),
    })

    render(<NotificationBell role="manager" />, { wrapper })
    const bell = await screen.findByTestId('bell-button')
    
    const user = userEvent.setup()
    await user.click(bell)
    expect(screen.getByTestId('notif-panel')).toBeVisible()
  })

  it('TC-7.11-04: clicking outside closes notification panel', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [] }),
    })

    render(
      <div data-testid="outside">
        <NotificationBell role="manager" />
      </div>,
      { wrapper }
    )
    
    const bell = await screen.findByTestId('bell-button')
    const user = userEvent.setup()
    await user.click(bell)
    expect(screen.getByTestId('notif-panel')).toBeVisible()
    
    await user.click(screen.getByTestId('outside'))
    expect(screen.queryByTestId('notif-panel')).not.toBeInTheDocument()
  })

  it('TC-7.11-05: "Xem tất cả" link uses correct role route', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [] }),
    })

    render(<NotificationBell role="manager" />, { wrapper })
    
    const bell = await screen.findByTestId('bell-button')
    const user = userEvent.setup()
    await user.click(bell)
    
    const link = screen.getByRole('link', { name: /xem tất cả/i })
    expect(link).toHaveAttribute('href', '/manager/notifications')
  })

  it('TC-7.11-08: clicking a notification marks it as read via PUT /api/notifications', async () => {
    // Use mockImplementation so SWR refetches (focus, dedup) don't exhaust the mock
    ;(global.fetch as jest.Mock).mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          notifications: [
            { id: '1', title: 'Test', detail: 'Detail', tone: 'green', created_at: new Date().toISOString(), read: false },
          ],
        }),
      })
    })

    render(<NotificationBell role="manager" />, { wrapper })

    // Wait for SWR to load AND component to re-render with data
    // Badge appearing is the reliable signal that data is loaded and rendered
    const badge = await screen.findByTestId('notif-badge')
    expect(badge).toHaveTextContent('1')
    
    const bell = await screen.findByTestId('bell-button')
    const user = userEvent.setup()
    await user.click(bell)
    
    const notifItem = await screen.findByTestId('notif-item-1')
    
    ;(global.fetch as jest.Mock).mockClear()
    
    await user.click(notifItem)
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/notifications', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ id: '1' })
      }))
    })
  })
})
