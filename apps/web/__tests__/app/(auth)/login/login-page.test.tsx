// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import LoginPage from '@/app/(auth)/login/page'
import { LoginForm } from '@/app/(auth)/login/_components/login-form'

// Mock the react-dom hooks used in client component
let mockFormState: { error?: string } | null = null;
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  useFormState: () => [mockFormState, '/dummy-action'],
  useFormStatus: () => ({ pending: false })
}))

// Mock the action to avoid ESM import issues with next-auth in Jest
jest.mock('@/app/(auth)/login/actions', () => ({
  loginAction: jest.fn()
}))

describe('Login Page', () => {
  beforeEach(() => {
    mockFormState = null;
  });

  it('1.5a-UNIT-001: renders brand name DX AgriMarket', () => {
    render(<LoginPage />)
    expect(screen.getByText('DX AgriMarket')).toBeInTheDocument()
  })

  it('1.5a-UNIT-002: renders subtitle Hệ điều hành số Nông nghiệp', () => {
    render(<LoginPage />)
    expect(screen.getAllByText(/hệ điều hành số/i).length).toBeGreaterThan(0)
  })

  it('1.5a-UNIT-003: no inline style attributes on any element (AC: 1)', () => {
    const { container } = render(<LoginPage />)
    const inlineStyles = container.querySelectorAll('[style]')
    expect(inlineStyles).toHaveLength(0)
  })

  it('1.5a-UNIT-004: no Tailwind class names in rendered HTML (AC: 1)', () => {
    const { container } = render(<LoginPage />)
    const tailwindPattern = /\b(p-\d|m-\d|text-gray|font-bold|max-w-)\b/
    expect(container.innerHTML).not.toMatch(tailwindPattern)
  })

  it('1.5a-UNIT-005: login button present with type submit', () => {
    render(<LoginPage />)
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('type', 'submit')
  })

  it('TC-7.6-04: Error Banner Visible on Keycloak Failure (Unit)', async () => {
    mockFormState = { error: 'Không thể kết nối máy chủ xác thực.' };
    render(<LoginForm />)
    
    // The banner should be rendered due to the mocked state
    expect(await screen.findByText(/Không thể kết nối/)).toBeInTheDocument()
  })
})
