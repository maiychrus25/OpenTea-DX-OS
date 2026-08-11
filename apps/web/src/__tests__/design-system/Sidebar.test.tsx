import * as React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Sidebar } from '@/components/layout'

jest.mock('next/navigation', () => ({
  usePathname: () => '/manager/dashboard',
}))

describe('Sidebar', () => {
  const navItems = [
    { label: 'Tổng quan', href: '/manager/dashboard', icon: <span /> },
    { label: 'Bản tin', href: '/manager/bulletin', icon: <span /> },
  ]

  it('marks active item based on current pathname', () => {
    render(<Sidebar navItems={navItems} />)
    const activeItem = screen.getByText('Tổng quan').closest('a')
    expect(activeItem).toHaveClass('active')
  })

  it('non-active items do not have active class', () => {
    render(<Sidebar navItems={navItems} />)
    const inactiveItem = screen.getByText('Bản tin').closest('a')
    expect(inactiveItem).not.toHaveClass('active')
  })
})
