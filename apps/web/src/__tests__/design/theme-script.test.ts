// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { THEME_STORAGE_KEY, themeInitScript } from '@/components/ui/ThemeToggle/theme'

// Runs the exact string that layout.tsx inlines before first paint.
const runInitScript = () => new Function(themeInitScript)()

describe('theme init script', () => {
  const root = document.documentElement

  afterEach(() => {
    root.removeAttribute('data-theme')
    localStorage.clear()
    jest.restoreAllMocks()
  })

  it('uses the opentea-theme storage key', () => {
    expect(THEME_STORAGE_KEY).toBe('opentea-theme')
  })

  it('sets data-theme="dark" when dark is stored', () => {
    localStorage.setItem('opentea-theme', 'dark')
    runInitScript()
    expect(root.getAttribute('data-theme')).toBe('dark')
  })

  it('sets data-theme="light" when light is stored', () => {
    localStorage.setItem('opentea-theme', 'light')
    runInitScript()
    expect(root.getAttribute('data-theme')).toBe('light')
  })

  it.each([['system'], ['nonsense'], [null]])('leaves the attribute unset for stored %p', (value) => {
    if (value !== null) localStorage.setItem('opentea-theme', value)
    runInitScript()
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it('does not throw and leaves the attribute unset when reading storage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(runInitScript).not.toThrow()
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it('does not throw when the localStorage accessor itself throws', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    try {
      expect(runInitScript).not.toThrow()
      expect(root.hasAttribute('data-theme')).toBe(false)
    } finally {
      Object.defineProperty(window, 'localStorage', original)
    }
  })
})
