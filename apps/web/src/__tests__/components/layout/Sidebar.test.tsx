// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/layout/Sidebar/Sidebar'

// Mock usePathname
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}))

// We need to test isActive. Wait, isActive is not exported.
// We can test it by rendering a component with different active paths.
// Let's create a wrapper or just check the active class.
import { usePathname } from 'next/navigation'

const mockItems = [{ label: 'Dashboard', href: '/manager/dashboard', icon: <span /> }]

describe('Sidebar Component', () => {
  beforeEach(() => {
    ;(usePathname as jest.Mock).mockReturnValue('/manager/dashboard')
  })

  it('renders brand block and coop block', () => {
    render(<Sidebar navItems={mockItems} htxName="HTX MD2" htxLocation="Tiền Giang" onClose={() => {}} />)
    expect(screen.getByText('DX AgriMarket')).toBeInTheDocument()
    expect(screen.getByText('HTX MD2')).toBeInTheDocument()
  })

  it('renders nav items', () => {
    render(<Sidebar navItems={mockItems} onClose={() => {}} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('highlights active item when pathname matches exact href', () => {
    ;(usePathname as jest.Mock).mockReturnValue('/manager/dashboard')
    render(<Sidebar navItems={mockItems} />)
    const link = screen.getByText('Dashboard').closest('a')
    expect(link?.className).toContain('active')
  })

  it('highlights active item when pathname starts with href + /', () => {
    ;(usePathname as jest.Mock).mockReturnValue('/manager/dashboard/lots/123')
    render(<Sidebar navItems={mockItems} />)
    const link = screen.getByText('Dashboard').closest('a')
    expect(link?.className).toContain('active')
  })

  it('does not highlight item when no match', () => {
    ;(usePathname as jest.Mock).mockReturnValue('/manager/lots')
    render(<Sidebar navItems={mockItems} />)
    const link = screen.getByText('Dashboard').closest('a')
    expect(link?.className).not.toContain('active')
  })
})
