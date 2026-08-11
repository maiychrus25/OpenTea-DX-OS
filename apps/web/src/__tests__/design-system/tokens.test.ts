import '@testing-library/jest-dom'
import * as fs from 'fs'
import * as path from 'path'

const REQUIRED_TOKENS = [
  '--color-primary',
  '--color-primary-hover',
  '--color-primary-subtle',
  '--color-primary-foreground',
  '--color-accent',
  '--color-accent-hover',
  '--color-accent-subtle',
  '--color-status-sowing',
  '--color-status-tending',
  '--color-status-harvest-approved',
  '--color-status-harvested',
  '--color-status-draft',
  '--color-success',
  '--color-warning',
  '--color-danger',
  '--color-info',
  '--color-surface-page',
  '--color-surface-card',
  '--color-border-subtle',
  '--color-border-default',
  '--color-border-focus',
  '--color-ink-primary',
  '--color-ink-secondary',
  '--color-map-overlay',
  '--color-badge-unread',
  '--font-size-display',
  '--font-size-body-large',
  '--sidebar-width',
  '--topbar-height',
]

const cssPath = path.join(process.cwd(), 'src/styles/globals.css')

describe('Design Token Coverage', () => {
  it('globals.css contains all required tokens', () => {
    const css = fs.readFileSync(cssPath, 'utf-8')
    REQUIRED_TOKENS.forEach(token => {
      expect(css).toContain(token)
    })
  })

  it('--color-primary value is #16A34A', () => {
    const css = fs.readFileSync(cssPath, 'utf-8')
    expect(css).toMatch(/--color-primary:\s*#16A34A/i)
  })

  it('--color-accent value is #EA580C', () => {
    const css = fs.readFileSync(cssPath, 'utf-8')
    expect(css).toMatch(/--color-accent:\s*#EA580C/i)
  })

  it('--font-size-body-large value is 1.0625rem', () => {
    const css = fs.readFileSync(cssPath, 'utf-8')
    expect(css).toMatch(/--font-size-body-large:\s*1\.0625rem/)
  })
})
