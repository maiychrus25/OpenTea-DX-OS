// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { GlobalSearch } from '@/components/ui/GlobalSearch/GlobalSearch'
import { GlobalSearchInput } from '@/components/ui/GlobalSearch/GlobalSearchInput'

describe('GlobalSearch Component', () => {
  beforeEach(() => {
    // Reset body style
    document.body.style.overflow = ''
    jest.clearAllMocks()
    
    global.fetch = jest.fn(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] }) // we can return empty array from api, component will merge with STATIC_SUGGESTIONS
      })
    ) as jest.Mock
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<GlobalSearch isOpen={false} onClose={jest.fn()} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders modal dialog when isOpen is true', () => {
    render(<GlobalSearch isOpen={true} onClose={jest.fn()} />)
    
    const dialog = screen.getByRole('dialog', { name: /hộp thoại tìm kiếm toàn cục/i })
    expect(dialog).toBeInTheDocument()

    const input = screen.getByPlaceholderText(/tìm kiếm thành viên, thửa đất, lô hàng, tài liệu/i)
    expect(input).toBeInTheDocument()
  })

  it('locks body scroll when opened and restores on close', () => {
    const { rerender } = render(<GlobalSearch isOpen={true} onClose={jest.fn()} />)
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<GlobalSearch isOpen={false} onClose={jest.fn()} />)
    expect(document.body.style.overflow).toBe('')
  })

  it('calls onClose when clicking the backdrop overlay', () => {
    const handleClose = jest.fn()
    render(<GlobalSearch isOpen={true} onClose={handleClose} />)

    const overlay = screen.getByTestId('global-search-overlay')
    fireEvent.click(overlay)

    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when clicking inside the modal content', () => {
    const handleClose = jest.fn()
    render(<GlobalSearch isOpen={true} onClose={handleClose} />)

    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)

    expect(handleClose).not.toHaveBeenCalled()
  })

  it('calls onClose when clicking close button', () => {
    const handleClose = jest.fn()
    render(<GlobalSearch isOpen={true} onClose={handleClose} />)

    const closeBtn = screen.getByRole('button', { name: /đóng tìm kiếm/i })
    fireEvent.click(closeBtn)

    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when pressing Escape key', () => {
    const handleClose = jest.fn()
    render(<GlobalSearch isOpen={true} onClose={handleClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('switches active filter when a filter tab is clicked', () => {
    render(<GlobalSearch isOpen={true} onClose={jest.fn()} />)

    const memberTab = screen.getByRole('tab', { name: 'Thành viên' })
    expect(memberTab).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(memberTab)
    expect(memberTab).toHaveAttribute('aria-selected', 'true')
  })

  it('searches and shows results or empty state based on input', async () => {
    render(<GlobalSearch isOpen={true} onClose={jest.fn()} />)

    const input = screen.getByPlaceholderText(/tìm kiếm thành viên/i)
    fireEvent.change(input, { target: { value: 'Nguyễn' } })

    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    }, { timeout: 1000 })
  })
})

describe('GlobalSearchInput Component', () => {
  it('renders trigger with search text and shortcut badge', () => {
    render(<GlobalSearchInput />)

    const trigger = screen.getByRole('button', { name: /mở tìm kiếm nhanh/i })
    expect(trigger).toBeInTheDocument()
    expect(screen.getByText('Tìm kiếm...')).toBeInTheDocument()
    expect(screen.getByText(/Ctrl K|⌘K/)).toBeInTheDocument()
  })

  it('opens modal when clicking the input trigger', () => {
    render(<GlobalSearchInput />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: /mở tìm kiếm nhanh/i })
    fireEvent.click(trigger)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens modal when pressing Ctrl + K shortcut', () => {
    render(<GlobalSearchInput />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
