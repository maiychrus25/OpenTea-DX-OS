// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import * as React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Sidebar } from '@/components/layout'

jest.mock('next/navigation', () => ({
  usePathname: () => '/manager/dashboard',
}))

describe('Sidebar', () => {
  const navItems = [
    { label: 'Tá»•ng quan', href: '/manager/dashboard', icon: <span /> },
    { label: 'Báº£n tin', href: '/manager/bulletin', icon: <span /> },
  ]

  it('marks active item based on current pathname', () => {
    render(<Sidebar navItems={navItems} />)
    const activeItem = screen.getByText('Tá»•ng quan').closest('a')
    expect(activeItem).toHaveClass('active')
  })

  it('non-active items do not have active class', () => {
    render(<Sidebar navItems={navItems} />)
    const inactiveItem = screen.getByText('Báº£n tin').closest('a')
    expect(inactiveItem).not.toHaveClass('active')
  })
})
