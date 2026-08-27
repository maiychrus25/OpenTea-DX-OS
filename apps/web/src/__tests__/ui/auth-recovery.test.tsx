// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RegisterForm } from '@/app/(auth)/register/_components/register-form'

// Next.js Link mock
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})

// Helper: get submit button via role + name (Button renders data-testid="button-primary")
function getSubmitButton() {
  return screen.getByRole('button', { name: /Đăng ký tài khoản/i })
}

// Helper: fill valid registration form
function fillValidForm() {
  fireEvent.change(screen.getByTestId('input-fullname'), { target: { value: 'Nguyễn Văn An' } })
  fireEvent.change(screen.getByTestId('input-phone'), { target: { value: '0901234567' } })
  fireEvent.change(screen.getByTestId('select-htx'), { target: { value: 'HTX-001' } })
  fireEvent.change(screen.getByTestId('input-pin'), { target: { value: '123456' } })
  fireEvent.change(screen.getByTestId('input-confirm-pin'), { target: { value: '123456' } })
  fireEvent.click(screen.getByTestId('checkbox-consent'))
}

// ─── 8.10-UNIT-003: Registration consent và pending approval state ─────────────
describe('RegisterForm', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders all form fields', () => {
    render(<RegisterForm />)
    expect(screen.getByTestId('input-fullname')).toBeInTheDocument()
    expect(screen.getByTestId('input-phone')).toBeInTheDocument()
    expect(screen.getByTestId('select-htx')).toBeInTheDocument()
    expect(screen.getByTestId('input-pin')).toBeInTheDocument()
    expect(screen.getByTestId('input-confirm-pin')).toBeInTheDocument()
    expect(screen.getByTestId('checkbox-consent')).toBeInTheDocument()
    expect(getSubmitButton()).toBeInTheDocument()
  })

  it('mock mode banner visible at all times', () => {
    render(<RegisterForm />)
    expect(screen.getByTestId('mock-mode-banner')).toBeInTheDocument()
    expect(screen.getByTestId('mock-mode-banner')).toHaveAttribute('role', 'note')
  })

  it('8.10-UNIT-001: shows field errors when submitted empty', async () => {
    render(<RegisterForm />)
    fireEvent.click(getSubmitButton())
    await waitFor(() => {
      expect(screen.getByTestId('error-fullname')).toBeInTheDocument()
      expect(screen.getByTestId('error-phone')).toBeInTheDocument()
      expect(screen.getByTestId('error-htx')).toBeInTheDocument()
      expect(screen.getByTestId('error-pin')).toBeInTheDocument()
      expect(screen.getByTestId('error-confirm-pin')).toBeInTheDocument()
      expect(screen.getByTestId('error-consent')).toBeInTheDocument()
    })
  })

  it('8.10-UNIT-001: shows phone format error for invalid phone', async () => {
    render(<RegisterForm />)
    fireEvent.change(screen.getByTestId('input-phone'), { target: { value: '12345' } })
    fireEvent.click(getSubmitButton())
    await waitFor(() => {
      expect(screen.getByTestId('error-phone')).toHaveTextContent('định dạng')
    })
  })

  it('8.10-UNIT-001: shows PIN length error for short PIN', async () => {
    render(<RegisterForm />)
    fireEvent.change(screen.getByTestId('input-pin'), { target: { value: '123' } })
    fireEvent.click(getSubmitButton())
    await waitFor(() => {
      expect(screen.getByTestId('error-pin')).toHaveTextContent('6 chữ số')
    })
  })

  it('8.10-UNIT-001: shows PIN mismatch error', async () => {
    render(<RegisterForm />)
    fireEvent.change(screen.getByTestId('input-pin'), { target: { value: '123456' } })
    fireEvent.change(screen.getByTestId('input-confirm-pin'), { target: { value: '654321' } })
    fireEvent.click(getSubmitButton())
    await waitFor(() => {
      expect(screen.getByTestId('error-confirm-pin')).toHaveTextContent('không khớp')
    })
  })

  it('8.10-UNIT-003: cannot submit without consent checkbox', async () => {
    render(<RegisterForm />)
    fireEvent.change(screen.getByTestId('input-fullname'), { target: { value: 'Nguyễn Văn An' } })
    fireEvent.change(screen.getByTestId('input-phone'), { target: { value: '0901234567' } })
    fireEvent.change(screen.getByTestId('select-htx'), { target: { value: 'HTX-001' } })
    fireEvent.change(screen.getByTestId('input-pin'), { target: { value: '123456' } })
    fireEvent.change(screen.getByTestId('input-confirm-pin'), { target: { value: '123456' } })
    // consent NOT checked → submit
    fireEvent.click(getSubmitButton())
    await waitFor(() => {
      expect(screen.getByTestId('error-consent')).toBeInTheDocument()
      expect(screen.queryByTestId('pending-approval-state')).not.toBeInTheDocument()
    })
  })

  it('8.10-UNIT-003: shows pending-approval state after valid submit', async () => {
    render(<RegisterForm />)
    fillValidForm()
    fireEvent.click(getSubmitButton())

    // Advance timers inside act() to flush the 1000ms setTimeout
    await act(async () => {
      jest.advanceTimersByTime(1500)
    })

    await waitFor(() => {
      expect(screen.getByTestId('pending-approval-state')).toBeInTheDocument()
    })
    expect(screen.getByText(/chờ phê duyệt/i)).toBeInTheDocument()
    // Back to login link rendered
    expect(screen.getByRole('link', { name: /quay về trang đăng nhập/i })).toHaveAttribute('href', '/login')
  })

  it('8.10-UNIT-003: pending state contains applicant name', async () => {
    render(<RegisterForm />)
    fireEvent.change(screen.getByTestId('input-fullname'), { target: { value: 'Trần Thị Lan' } })
    fireEvent.change(screen.getByTestId('input-phone'), { target: { value: '0901234567' } })
    fireEvent.change(screen.getByTestId('select-htx'), { target: { value: 'HTX-002' } })
    fireEvent.change(screen.getByTestId('input-pin'), { target: { value: '654321' } })
    fireEvent.change(screen.getByTestId('input-confirm-pin'), { target: { value: '654321' } })
    fireEvent.click(screen.getByTestId('checkbox-consent'))
    fireEvent.click(getSubmitButton())

    await act(async () => {
      jest.advanceTimersByTime(1500)
    })

    await waitFor(() => {
      expect(screen.getByTestId('pending-approval-state')).toBeInTheDocument()
      expect(screen.getByText(/Trần Thị Lan/)).toBeInTheDocument()
    })
  })
})

// ─── 8.10-UNIT-002: Login error states ────────────────────────────────────────
// LoginForm depends on useSearchParams (Next.js context) — tested via E2E.
// Pure validation logic tested in auth-validation-utils.test.ts
