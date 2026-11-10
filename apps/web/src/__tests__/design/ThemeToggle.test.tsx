// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

describe('ThemeToggle', () => {
  const root = document.documentElement

  afterEach(() => {
    root.removeAttribute('data-theme')
    localStorage.clear()
    jest.restoreAllMocks()
  })

  it('starts from the system setting with an accessible name', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: /giao diện: theo hệ thống/i })).toBeInTheDocument()
  })

  it('cycles light → dark → system and persists each choice', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    const button = screen.getByRole('button')

    await user.click(button)
    expect(root.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('opentea-theme')).toBe('light')
    expect(button).toHaveAccessibleName(/giao diện: sáng/i)

    await user.click(button)
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('opentea-theme')).toBe('dark')
    expect(button).toHaveAccessibleName(/giao diện: tối/i)

    await user.click(button)
    expect(root.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem('opentea-theme')).toBe('system')
    expect(button).toHaveAccessibleName(/giao diện: theo hệ thống/i)
  })

  it('reads the stored choice on mount', async () => {
    localStorage.setItem('opentea-theme', 'dark')
    render(<ThemeToggle />)
    expect(await screen.findByRole('button', { name: /giao diện: tối/i })).toBeInTheDocument()
  })

  it('works from the keyboard', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(root.getAttribute('data-theme')).toBe('light')
    await user.keyboard(' ')
    expect(root.getAttribute('data-theme')).toBe('dark')
  })

  it('still switches the theme when storage is unavailable', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button'))
    expect(root.getAttribute('data-theme')).toBe('light')
  })
})
