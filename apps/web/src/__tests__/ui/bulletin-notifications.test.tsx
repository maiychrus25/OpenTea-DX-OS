// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import FarmerBulletinNotificationsPage from '@/app/farmer/bulletin-notifications/page'

// Mock the SWR hook and NotificationInbox component since we just want to test the page container layout
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: { data: { notifications: [], unreadCount: 0 } }, mutate: jest.fn(), isLoading: false }),
}))

jest.mock('@/components/features/notification/NotificationInbox', () => ({
  NotificationInbox: ({ showPageHeader }: { showPageHeader: boolean }) => (
    <div data-testid="mock-notification-inbox" data-header-visible={showPageHeader}>
      Mock Inbox
    </div>
  )
}))

describe('FarmerBulletinNotificationsPage', () => {
  it('renders the header and tabs correctly', () => {
    render(<FarmerBulletinNotificationsPage />)
    
    expect(screen.getByText('Bản tin & Thông báo')).toBeInTheDocument()
    expect(screen.getByText('Thông tin thị trường, kỹ thuật từ HTX và thông báo của riêng bạn')).toBeInTheDocument()
    
    const bulletinTab = screen.getByRole('button', { name: /^Bản tin$/i })
    const notifTab = screen.getByRole('button', { name: /Thông báo/i })
    
    expect(bulletinTab).toBeInTheDocument()
    expect(notifTab).toBeInTheDocument()
  })

  it('shows the bulletin tab by default with a link to the real bulletins and no invented articles', () => {
    render(<FarmerBulletinNotificationsPage />)

    expect(screen.getByRole('link', { name: 'Bản tin' })).toHaveAttribute('href', '/farmer/bulletin')
    expect(screen.queryByTestId('mock-notification-inbox')).not.toBeInTheDocument()
  })

  it('switches to notifications tab when clicked and passes showPageHeader=false', () => {
    render(<FarmerBulletinNotificationsPage />)
    
    const notifTab = screen.getByRole('button', { name: /Thông báo/i })
    fireEvent.click(notifTab)
    
    // Inbox should now be visible
    const inbox = screen.getByTestId('mock-notification-inbox')
    expect(inbox).toBeInTheDocument()
    
    // showPageHeader should be false
    expect(inbox).toHaveAttribute('data-header-visible', 'false')

    expect(screen.queryByRole('link', { name: 'Bản tin' })).not.toBeInTheDocument()
  })
})
