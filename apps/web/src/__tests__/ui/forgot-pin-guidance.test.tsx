// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen } from '@testing-library/react'
import { LoginForm } from '@/app/(auth)/login/_components/login-form'
import UnauthorizedPage from '@/app/unauthorized/page'
import { auth } from '@/auth'

const NOTE = 'Quên mã PIN? Hãy liên hệ cán bộ HTX để được đặt lại.'
let search = ''

jest.mock('next-auth/react', () => ({ signIn: jest.fn() }))
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }))
jest.mock('@/auth', () => ({ auth: jest.fn().mockResolvedValue(null) }))

describe('forgot PIN guidance', () => {
  it('login page shows contact guidance instead of a link to a recovery page', () => {
    search = ''
    render(<LoginForm />)
    expect(screen.getByTestId('forgot-pin-note')).toHaveTextContent(NOTE)
    expect(screen.queryByTestId('forgot-pin-link')).not.toBeInTheDocument()
    expect(document.querySelector('a[href="/forgot-pin"]')).toBeNull()
  })

  it('locked login banner shows the same guidance without a link', () => {
    search = 'error=locked'
    render(<LoginForm />)
    expect(screen.getByTestId('locked-recovery-note')).toHaveTextContent(NOTE)
    expect(document.querySelector('a[href="/forgot-pin"]')).toBeNull()
  })

  it('locked unauthorized page shows the guidance without a link', async () => {
    render(await UnauthorizedPage({ searchParams: Promise.resolve({ state: 'locked' }) }))
    expect(screen.getByTestId('locked-forgot-pin-note')).toHaveTextContent(NOTE)
    expect(document.querySelector('a[href="/forgot-pin"]')).toBeNull()
  })

  it.each(['manager', 'officer', 'farmer'])('unauthorized page sends a %s back to their dashboard', async (role) => {
    ;(auth as jest.Mock).mockResolvedValueOnce({ user: { role } })
    render(await UnauthorizedPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('link', { name: 'Về trang phù hợp' })).toHaveAttribute('href', `/${role}/dashboard`)
  })
})
