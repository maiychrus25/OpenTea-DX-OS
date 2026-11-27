// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
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
        json: () => Promise.resolve({ data: [] })
      })
    ) as jest.Mock
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<GlobalSearch isOpen={false} onClose={jest.fn()} role="manager" />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders modal dialog when isOpen is true', () => {
    render(<GlobalSearch isOpen={true} onClose={jest.fn()} role="manager" />)
    
    const dialog = screen.getByRole('dialog', { name: /hộp thoại tìm kiếm toàn cục/i })
    expect(dialog).toBeInTheDocument()

    const input = screen.getByPlaceholderText(/tìm kiếm thành viên, thửa đất, lô hàng, tài liệu/i)
    expect(input).toBeInTheDocument()
  })

  it('locks body scroll when opened and restores on close', () => {
    const { rerender } = render(<GlobalSearch isOpen={true} onClose={jest.fn()} role="manager" />)
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<GlobalSearch isOpen={false} onClose={jest.fn()} role="manager" />)
    expect(document.body.style.overflow).toBe('')
  })

  it('calls onClose when clicking the backdrop overlay', () => {
    const handleClose = jest.fn()
    render(<GlobalSearch isOpen={true} onClose={handleClose} role="manager" />)

    const overlay = screen.getByTestId('global-search-overlay')
    fireEvent.click(overlay)

    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when clicking inside the modal content', () => {
    const handleClose = jest.fn()
    render(<GlobalSearch isOpen={true} onClose={handleClose} role="manager" />)

    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)

    expect(handleClose).not.toHaveBeenCalled()
  })

  it('calls onClose when clicking close button', () => {
    const handleClose = jest.fn()
    render(<GlobalSearch isOpen={true} onClose={handleClose} role="manager" />)

    const closeBtn = screen.getByRole('button', { name: /đóng tìm kiếm/i })
    fireEvent.click(closeBtn)

    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when pressing Escape key', () => {
    const handleClose = jest.fn()
    render(<GlobalSearch isOpen={true} onClose={handleClose} role="manager" />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('switches active filter when a filter tab is clicked', () => {
    render(<GlobalSearch isOpen={true} onClose={jest.fn()} role="manager" />)

    const memberTab = screen.getByRole('tab', { name: 'Thành viên' })
    expect(memberTab).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(memberTab)
    expect(memberTab).toHaveAttribute('aria-selected', 'true')
  })

  it('renders no static suggestion and shows the empty state when nothing matches', async () => {
    render(<GlobalSearch isOpen={true} onClose={jest.fn()} role="manager" />)

    fireEvent.change(screen.getByPlaceholderText(/tìm kiếm thành viên/i), { target: { value: 'Nguyễn' } })

    expect(await screen.findByText(/Không tìm thấy kết quả nào/, {}, { timeout: 1500 })).toBeInTheDocument()
    expect(screen.queryByText('Nguyễn Văn A')).not.toBeInTheDocument()
    expect(screen.queryByText(/Robusta/)).not.toBeInTheDocument()
  })

  it('shows an error, not invented results, when the search request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as jest.Mock
    render(<GlobalSearch isOpen={true} onClose={jest.fn()} role="manager" />)

    fireEvent.change(screen.getByPlaceholderText(/tìm kiếm thành viên/i), { target: { value: 'Nguyễn' } })

    expect(await screen.findByText(/Lỗi kết nối/, {}, { timeout: 1500 })).toBeInTheDocument()
    expect(screen.queryByText('Nguyễn Văn A')).not.toBeInTheDocument()
  })

  const found = [
    { type: 'HOUSEHOLD', id: 'h1', title: 'Hộ Lan', subtitle: '0901' },
    { type: 'PARCEL', id: 'p1', title: 'P-01', subtitle: 'Hộ: Lan' },
    { type: 'LOT', id: 'l1', title: 'LOT-7', subtitle: 'Status: DRAFT' },
  ]
  const hrefs = async (role: 'manager' | 'officer') => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: found }) }) as jest.Mock
    render(<GlobalSearch isOpen={true} onClose={jest.fn()} role={role} />)
    fireEvent.change(screen.getByPlaceholderText(/tìm kiếm thành viên/i), { target: { value: 'Lan' } })
    await screen.findByText('Hộ Lan', {}, { timeout: 1500 })
    return ['Hộ Lan', 'P-01', 'LOT-7'].map(title => screen.getByText(title).closest('a')!.getAttribute('href'))
  }

  it("links an officer's household, parcel and lot results under /officer/", async () => {
    expect(await hrefs('officer')).toEqual(['/officer/households/h1', '/officer/farm-zones', '/officer/lots'])
  })

  it("links a manager's results to pages that exist", async () => {
    expect(await hrefs('manager')).toEqual(['/manager/members', '/manager/farm-zones', '/manager/lots/LOT-7'])
  })
})

describe('GlobalSearchInput Component', () => {
  it('renders trigger with search text and shortcut badge', () => {
    render(<GlobalSearchInput role="manager" />)

    const trigger = screen.getByRole('button', { name: /mở tìm kiếm nhanh/i })
    expect(trigger).toBeInTheDocument()
    expect(screen.getByText('Tìm kiếm...')).toBeInTheDocument()
    expect(screen.getByText(/Ctrl K|⌘K/)).toBeInTheDocument()
  })

  it('opens modal when clicking the input trigger', () => {
    render(<GlobalSearchInput role="manager" />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: /mở tìm kiếm nhanh/i })
    fireEvent.click(trigger)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens modal when pressing Ctrl + K shortcut', () => {
    render(<GlobalSearchInput role="manager" />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
