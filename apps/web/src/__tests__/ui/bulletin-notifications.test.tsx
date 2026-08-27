// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import FarmerBulletinNotificationsPage from '@/app/farmer/bulletin-notifications/page'
import { MOCK_BULLETINS } from '@/components/features/bulletin/mock-data'

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
    expect(screen.getByText('Cập nhật thông tin thị trường và thông báo cá nhân của bạn')).toBeInTheDocument()
    
    const bulletinTab = screen.getByRole('button', { name: /^Bản tin$/i })
    const notifTab = screen.getByRole('button', { name: /Thông báo/i })
    
    expect(bulletinTab).toBeInTheDocument()
    expect(notifTab).toBeInTheDocument()
  })

  it('shows bulletin tab by default with MOCK_BULLETINS', () => {
    render(<FarmerBulletinNotificationsPage />)
    
    // Check if the mock bulletins are rendered
    expect(screen.getByText(MOCK_BULLETINS[0].headline)).toBeInTheDocument()
    expect(screen.getByText(MOCK_BULLETINS[1].headline)).toBeInTheDocument()
    expect(screen.getByText(MOCK_BULLETINS[2].headline)).toBeInTheDocument()
    
    // Check that inbox is NOT rendered yet
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
    
    // Bulletins should be hidden
    expect(screen.queryByText(MOCK_BULLETINS[0].headline)).not.toBeInTheDocument()
  })
})
