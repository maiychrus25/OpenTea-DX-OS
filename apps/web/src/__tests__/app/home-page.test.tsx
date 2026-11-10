// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HomePage from '@/app/page'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

describe('home page', () => {
  beforeEach(() => push.mockClear())

  it('introduces the product and links to sign-in', () => {
    render(<HomePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'OpenTea DX-OS' })).toBeInTheDocument()
    expect(screen.getByText(/hợp tác xã chè/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login')
  })

  it('has a theme toggle', () => {
    render(<HomePage />)
    expect(screen.getByRole('button', { name: /giao diện/i })).toBeInTheDocument()
  })

  it('opens the public trace page for a trimmed, encoded lot code', async () => {
    const user = userEvent.setup()
    render(<HomePage />)
    await user.type(screen.getByLabelText('Mã lô hàng'), '  TC 2026/01  ')
    await user.click(screen.getByRole('button', { name: 'Tra cứu' }))
    expect(push).toHaveBeenCalledWith('/q/TC%202026%2F01')
  })

  it('submits with Enter', async () => {
    const user = userEvent.setup()
    render(<HomePage />)
    await user.type(screen.getByLabelText('Mã lô hàng'), 'LOT-TC-001{Enter}')
    expect(push).toHaveBeenCalledWith('/q/LOT-TC-001')
  })

  it('shows a validation message for an empty code', async () => {
    const user = userEvent.setup()
    render(<HomePage />)
    const input = screen.getByLabelText('Mã lô hàng')
    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: 'Tra cứu' }))
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập mã lô hàng')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/vui lòng nhập mã lô hàng/i)
  })
})
