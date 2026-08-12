import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileForm } from '@/app/(manager)/profile/_components/ProfileForm'
import '@testing-library/jest-dom'

// Mock fetch
global.fetch = jest.fn() as jest.Mock

describe('ProfileForm', () => {
  const mockData = {
    id: '1',
    name: 'HTX Nông Nghiệp Test',
    address: '123 Đường Số 1',
    contact_phone: '0909123456',
    contact_email: 'test@example.com',
    crop_types: [],
    season_label: 'Vụ 1',
    htx_code: 'HTX01',
    total_area_ha: 100,
  }

  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear()
  })

  it('renders correctly in read-only mode initially', () => {
    render(<ProfileForm initialData={mockData} />)
    expect(screen.getByText('HTX Nông Nghiệp Test')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Tên HTX/i })).not.toBeInTheDocument()
  })

  it('prevents form submission with invalid data (client validation)', async () => {
    render(<ProfileForm initialData={mockData} />)
    
    // Switch to edit mode
    fireEvent.click(screen.getByText('Sửa'))

    // The name field should now be an input
    const nameInput = screen.getAllByRole('textbox')[0] // The first input should be name
    expect(nameInput).toHaveValue('HTX Nông Nghiệp Test')

    // Clear the name field
    await userEvent.clear(nameInput)

    // Submit form
    fireEvent.click(screen.getByText('Lưu'))

    // Expect validation error
    await waitFor(() => {
      expect(screen.getByText('Tên HTX không được để trống')).toBeInTheDocument()
    })

    // fetch should NOT be called
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
