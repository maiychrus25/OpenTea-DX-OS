// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

describe('globals.css design tokens', () => {
  let css: string = ''

  beforeAll(() => {
    const filePath = join(process.cwd(), 'src/styles/globals.css')
    if (existsSync(filePath)) {
      css = readFileSync(filePath, 'utf-8')
    }
  })

  it('imports tailwindcss', () => {
    expect(css).toContain("@import 'tailwindcss'")
  })

  it('contains prototype primary color', () => {
    expect(css).toContain('--primary:')
    expect(css).toContain('#176c4b')
  })

  it('contains sidebar-bg token', () => {
    expect(css).toContain('--sidebar-bg:')
    expect(css).toContain('#143c2d')
  })

  it('contains accent-lime token', () => {
    expect(css).toContain('--accent-lime:')
    expect(css).toContain('#d6f05c')
  })

  it('contains backward-compat alias for --color-primary', () => {
    expect(css).toContain('--color-primary:')
    expect(css).toContain('var(--primary)')
  })
})
