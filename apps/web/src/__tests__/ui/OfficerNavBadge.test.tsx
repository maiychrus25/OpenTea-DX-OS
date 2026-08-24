// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Sidebar } from '@/components/layout/Sidebar/Sidebar'
import { Home } from 'lucide-react'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: () => '/officer/dashboard'
}))

// Mock signout action
jest.mock('@/app/actions/signout-action', () => ({
  signOutAction: jest.fn()
}))

describe('OfficerNavBadge', () => {
  it('renders badge if navItem has badge property', () => {
    const navItems = [
      { label: 'Tổng quan', href: '/officer/dashboard', icon: <Home />, badge: 5 }
    ]

    render(
      <Sidebar navItems={navItems} role="officer" />
    )

    const badge = screen.getByText('5')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toMatch(/navBadge/)
  })

  it('does not render badge if navItem has no badge property', () => {
    const navItems = [
      { label: 'Tổng quan', href: '/officer/dashboard', icon: <Home /> }
    ]

    render(
      <Sidebar navItems={navItems} role="officer" />
    )

    const label = screen.getByText('Tổng quan')
    const parent = label.parentElement
    // Badge shouldn't exist
    expect(parent?.querySelector('[class*="navBadge"]')).not.toBeInTheDocument()
  })
})
