// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MiniAppFrame } from '@/components/features/apps/MiniAppFrame'

const frame = () => screen.getByTitle('Xin chào')

describe('MiniAppFrame', () => {
  afterEach(() => {
    localStorage.clear()
    jest.restoreAllMocks()
  })

  test('MiniAppFrame sets the sandbox without allow-scripts', () => {
    render(<MiniAppFrame src="/apps/hello" title="Xin chào" />)
    expect(frame().tagName).toBe('IFRAME')
    expect(frame().getAttribute('sandbox')).toBe(
      'allow-forms allow-same-origin allow-top-navigation-by-user-activation allow-downloads',
    )
    expect(frame().getAttribute('sandbox')).not.toMatch(/allow-scripts/)
  })

  test.each(['light', 'dark'])('MiniAppFrame passes the stored theme (%s)', (theme) => {
    localStorage.setItem('opentea-theme', theme)
    render(<MiniAppFrame src="/apps/hello/guide?said=hi" title="Xin chào" />)
    expect(frame().getAttribute('src')).toBe(`/apps/hello/guide?said=hi&theme=${theme}`)
  })

  test('adds no theme for the system setting', () => {
    localStorage.setItem('opentea-theme', 'system')
    render(<MiniAppFrame src="/apps/hello" title="Xin chào" />)
    expect(frame().getAttribute('src')).toBe('/apps/hello')
  })

  test('adds no theme when storage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<MiniAppFrame src="/apps/hello" title="Xin chào" />)
    expect(frame().getAttribute('src')).toBe('/apps/hello')
  })
})
