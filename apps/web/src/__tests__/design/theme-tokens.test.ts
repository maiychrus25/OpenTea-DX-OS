// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf-8')
const designMd = readFileSync(join(process.cwd(), '../../DESIGN.md'), 'utf-8')

type Decls = Record<string, string>

function declarations(body: string): Decls {
  const out: Decls = {}
  Array.from(body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)).forEach((m) => (out[m[1]] = m[2].trim()))
  return out
}

function block(re: RegExp, label: string): Decls {
  const m = css.match(re)
  if (!m) throw new Error(`globals.css has no ${label} block`)
  return declarations(m[1])
}

const light = block(/(?:^|\n):root\s*\{([^}]*)\}/, ':root')
const darkMedia = block(
  /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/,
  'prefers-color-scheme dark',
)
const darkAttr = block(/(?:^|\n):root\[data-theme="dark"\]\s*\{([^}]*)\}/, ':root[data-theme="dark"]')

const hasColorLiteral = (v: string) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v)
const lightColorTokens = Object.keys(light).filter((k) => hasColorLiteral(light[k]))

function resolve(theme: Decls, name: string): string {
  let value = theme[name]
  for (let i = 0; i < 10 && value?.startsWith('var('); i++) {
    value = theme[value.match(/^var\((--[\w-]+)\)$/)![1]]
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} does not resolve to a 6-digit hex: ${value}`)
  return value
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [text, background] pairs the components actually render.
const TEXT_PAIRS: Array<[string, string]> = [
  ['--color-ink-primary', '--color-surface-page'],
  ['--color-ink-primary', '--color-surface-card'],
  ['--color-ink-primary', '--color-surface-sunken'],
  ['--color-ink-primary', '--color-surface-overlay'],
  ['--color-ink-primary', '--secondary'],
  ['--color-ink-secondary', '--color-surface-page'],
  ['--color-ink-secondary', '--color-surface-card'],
  ['--color-ink-secondary', '--color-surface-sunken'],
  ['--color-ink-tertiary', '--color-surface-page'],
  ['--color-ink-tertiary', '--color-surface-card'],
  ['--muted-foreground', '--color-surface-page'],
  ['--muted-foreground', '--color-surface-card'],
  ['--muted-foreground', '--muted'],
  ['--color-primary', '--color-surface-page'],
  ['--color-primary', '--color-surface-card'],
  ['--color-primary', '--color-primary-subtle'],
  ['--color-primary-foreground', '--color-primary'],
  ['--color-primary-foreground', '--color-primary-hover'],
  ['--color-accent-foreground', '--color-accent'],
  ['--color-accent-foreground', '--color-accent-hover'],
  ['--color-accent', '--color-accent-subtle'],
  ['--sidebar-foreground', '--sidebar-bg'],
  ['--sidebar-bg', '--accent-lime'],
  ['--color-ink-inverse', '--color-status-sowing'],
  ['--color-ink-inverse', '--color-status-tending'],
  ['--color-ink-inverse', '--color-status-harvest-approved'],
  ['--color-ink-inverse', '--color-status-harvested'],
  ['--color-ink-inverse', '--color-status-draft'],
  ['--color-ink-inverse', '--color-danger'],
  ['--color-ink-inverse', '--color-danger-hover'],
  ['--color-ink-inverse', '--color-info'],
  ['--color-ink-inverse', '--color-badge-unread'],
  ['--color-success', '--color-success-subtle'],
  ['--color-warning', '--color-warning-subtle'],
  ['--color-danger', '--color-danger-subtle'],
  ['--color-info', '--color-info-subtle'],
  ['--color-success', '--color-surface-card'],
  ['--color-warning', '--color-surface-card'],
  ['--color-danger', '--color-surface-card'],
  ['--color-info', '--color-surface-card'],
]

const THEMES: Array<[string, Decls]> = [
  ['light', light],
  ['dark', { ...light, ...darkAttr }],
]

describe('theme tokens', () => {
  it('has colour tokens in the light set', () => {
    expect(lightColorTokens.length).toBeGreaterThan(30)
  })

  it.each(lightColorTokens)('%s has a dark value', (token) => {
    expect(darkMedia[token]).toBeDefined()
    expect(darkAttr[token]).toBeDefined()
  })

  it('declares the same dark values for the media query and data-theme="dark"', () => {
    expect(darkMedia).toEqual(darkAttr)
  })

  it('declares no dark-only tokens', () => {
    expect(Object.keys(darkAttr).filter((k) => !(k in light))).toEqual([])
  })

  it('keeps the brand primary #176c4b in the light theme', () => {
    expect(light['--primary']).toBe('#176c4b')
  })

  it('uses Be Vietnam Pro, not Inter, for --font-family-sans', () => {
    expect(light['--font-family-sans']).toMatch(/^var\(--font-be-vietnam\)/)
    expect(light['--font-family-sans']).not.toMatch(/inter/i)
  })

  describe.each(THEMES)('%s theme', (_name, theme) => {
    it.each(TEXT_PAIRS)('%s on %s meets WCAG AA 4.5:1', (text, bg) => {
      expect(contrast(resolve(theme, text), resolve(theme, bg))).toBeGreaterThanOrEqual(4.5)
    })
  })
})

// Minimal reader for the YAML front matter of DESIGN.md: nested maps, two-space indents, scalar values.
function frontMatter(md: string): Record<string, unknown> {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/)
  if (!m) throw new Error('DESIGN.md has no YAML front matter')
  const root: Record<string, unknown> = {}
  const stack: Array<{ indent: number; node: Record<string, unknown> }> = [{ indent: -1, node: root }]
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const indent = line.length - line.trimStart().length
    const kv = line.trim().match(/^("?)([^":]+)\1:\s*(.*)$/)
    if (!kv) throw new Error(`Unreadable front matter line: ${line}`)
    while (stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1].node
    const value = kv[3].replace(/^"(.*)"$/, '$1')
    if (value === '') {
      const child: Record<string, unknown> = {}
      parent[kv[2]] = child
      stack.push({ indent, node: child })
    } else {
      parent[kv[2]] = value
    }
  }
  return root
}

describe('DESIGN.md matches globals.css', () => {
  const fm = frontMatter(designMd)
  const colors = fm.colors as Record<string, string>
  const designName = (token: string) => token.replace(/^--(color-)?/, '')
  const plainColors = lightColorTokens.filter((t) => !t.startsWith('--shadow-'))
  const shadows = lightColorTokens.filter((t) => t.startsWith('--shadow-'))

  it('names the product OpenTea DX-OS', () => {
    expect(fm.name).toBe('OpenTea DX-OS')
  })

  it.each(plainColors)('%s light and dark values', (token) => {
    expect(colors[designName(token)]).toBe(light[token])
    expect(colors[`${designName(token)}-dark`]).toBe(darkAttr[token])
  })

  it.each(shadows)('%s light and dark values appear in the Elevation section', (token) => {
    expect(designMd).toContain(light[token])
    expect(designMd).toContain(darkAttr[token])
  })

  it('font sizes match', () => {
    const typography = fm.typography as Record<string, Record<string, string>>
    const sizes = Object.keys(light).filter((k) => k.startsWith('--font-size-'))
    expect(sizes.length).toBeGreaterThan(0)
    for (const token of sizes) {
      expect([token, typography[token.replace('--font-size-', '')]?.fontSize]).toEqual([token, light[token].split(/\s/)[0]])
    }
  })

  it('rounded and spacing scales match', () => {
    const rounded = fm.rounded as Record<string, string>
    const spacing = fm.spacing as Record<string, string>
    for (const token of Object.keys(light).filter((k) => k.startsWith('--rounded-'))) {
      expect([token, rounded[token.replace('--rounded-', '')]]).toEqual([token, light[token]])
    }
    for (const token of Object.keys(light).filter((k) => /^--spacing-[\w-]+$/.test(k) && /^\d+px$/.test(light[k]))) {
      expect([token, spacing[token.replace('--spacing-', '')]]).toEqual([token, light[token]])
    }
  })
})
