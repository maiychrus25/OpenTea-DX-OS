// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ProfileForm } from './ProfileForm'

// Mock the UI components that might cause issues in Jest
jest.mock('@/components/ui', () => ({
  // Note: using any for generic mock props because exact types are complex and unnecessary for basic render test
  Card: ({ children, className }: any) => <div data-testid="card" className={className}>{children}</div>,
  // Note: using any for generic mock props
  Button: ({ children, onClick, type, isLoading, disabled }: any) => (
    <button onClick={onClick} type={type} disabled={disabled || isLoading} data-testid="button">
      {children}
    </button>
  )
}))

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn()
  }
}))

// Mock next/navigation — required because ProfileForm uses useRouter()
// Without this Jest throws "Invariant expected app router to be mounted"
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  })),
  usePathname: jest.fn(() => '/manager/profile'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}))

describe('ProfileForm', () => {
  const mockInitialData = {
    id: 'test-id',
    htx_code: 'HTX-TEST-001',
    name: 'HTX Nông Nghiệp Test',
    address: '123 Đường Test, Xã Test',
    contact_phone: '0901234567',
    contact_email: 'test@example.com',
    season_label: 'Lứa 1/2026',
    crop_types: ['Chè Trung du', 'Chè Kim Tuyên'],
    total_area_ha: 15.5,
    created_at: new Date(),
    updated_at: new Date(),
    manager_id: 'manager-1'
  }

  it('renders the form with initial data', () => {
    // @ts-ignore - mock data matches required fields for testing
    render(<ProfileForm initialData={mockInitialData} />)
    
    expect(screen.getByText('Hồ sơ Hợp tác xã')).toBeInTheDocument()
    expect(screen.getByText('HTX Nông Nghiệp Test')).toBeInTheDocument()
    expect(screen.getByText('HTX-TEST-001')).toBeInTheDocument()
    expect(screen.getByText('123 Đường Test, Xã Test')).toBeInTheDocument()
    expect(screen.getByText('0901234567')).toBeInTheDocument()
  })

  it('can enter edit mode when clicking the edit button', () => {
    // @ts-ignore - mock data matches required fields for testing
    render(<ProfileForm initialData={mockInitialData} />)
    
    const editButton = screen.getByText('Sửa')
    fireEvent.click(editButton)
    
    // In edit mode, there should be save and cancel buttons
    expect(screen.getByText('Lưu')).toBeInTheDocument()
    expect(screen.getByText('Hủy')).toBeInTheDocument()
    
    // The inputs should be visible instead of just text
    const nameInput = screen.getByDisplayValue('HTX Nông Nghiệp Test')
    expect(nameInput).toBeInTheDocument()
  })

  // TC-1.6-02: ProfileForm Client Validation (Unit)
  it('prevents submission when required fields are empty (client validation)', async () => {
    // Setup fetch mock
    global.fetch = jest.fn()

    // @ts-ignore - mock data matches required fields for testing
    render(<ProfileForm initialData={mockInitialData} />)
    
    // Enter edit mode
    fireEvent.click(screen.getByText('Sửa'))
    
    // Clear the name field
    const nameInput = screen.getByDisplayValue('HTX Nông Nghiệp Test')
    fireEvent.change(nameInput, { target: { value: '' } })
    
    // Submit form
    fireEvent.click(screen.getByText('Lưu'))
    
    // Validation message should appear (handled asynchronously by react-hook-form + zod)
    const errorMessage = await screen.findByText(/tên htx không được để trống/i)
    expect(errorMessage).toBeInTheDocument()
    
    // fetch should not have been called
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
