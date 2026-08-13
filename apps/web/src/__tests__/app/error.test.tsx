// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorPage from '@/app/error'

describe('error.tsx', () => {
  it('1.2a-UNIT-001: renders error message with design system heading', () => {
    const mockReset = jest.fn()
    render(<ErrorPage error={new Error('Test')} reset={mockReset} />)
    expect(screen.getByRole('heading')).toBeInTheDocument()
  })

  it('1.2a-UNIT-002: Thử lại button calls reset()', async () => {
    const mockReset = jest.fn()
    render(<ErrorPage error={new Error('Test')} reset={mockReset} />)
    await userEvent.click(screen.getByRole('button', { name: /thử lại/i }))
    expect(mockReset).toHaveBeenCalledTimes(1)
  })

  it('1.2a-UNIT-003: no inline style attributes on any element', () => {
    const { container } = render(<ErrorPage error={new Error('x')} reset={() => {}} />)
    const allElements = container.querySelectorAll('[style]')
    expect(allElements).toHaveLength(0) // AC: 4
  })
})
