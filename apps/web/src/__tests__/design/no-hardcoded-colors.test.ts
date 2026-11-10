// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'

// Every colour must come from a token in src/styles/globals.css (see DESIGN.md).
// `baseline` listed files that still hard-coded colours; Task 10 of the Tier 2b plan emptied it. Keep it empty:
// a file listed here must still offend, so the list can only shrink.
const baseline: string[] = []

// Colours that must stay fixed whatever the theme. `allow` maps each exact snippet permitted in that file to the
// number of times it occurs, so an extra copy fails; any other colour in the file still fails. Keep this short.
const exceptions: Record<string, { allow: Record<string, number>; reason: string }> = {
  'src/components/features/map/ZoneMap.tsx': {
    allow: { "color: '#00ff00'": 1, "fillColor: '#00ff00'": 1 },
    reason: 'Parcel outlines are drawn on the satellite tiles, which look the same in both themes.',
  },
  'src/components/features/map/ZoneMap.module.css': {
    allow: { 'color: gray': 2, 'background-color: #f0f0f0': 1 },
    reason: 'These style the content of a Leaflet popup, which leaflet.css keeps white in both themes.',
  },
  'src/app/manager/farm-zones/_components/FarmZoneReadOnly.tsx': {
    allow: {
      "fillColor: '#16A34A', color: '#15803D'": 1,
      "fillColor: '#059669', color: '#047857'": 1,
      "fillColor: '#9CA3AF', color: '#6B7280'": 2,
      "fillColor: '#EA580C', color: '#C2410C'": 1,
      "fillColor: '#2563EB', color: '#1D4ED8'": 1,
      'stroke="#059669"': 1,
      'style="color:#64748b"': 4,
    },
    reason:
      'Parcel fills and the tooltip icon sit on map tiles that look the same in both themes, and the popup text sits in a Leaflet popup that leaflet.css keeps white.',
  },
  'src/app/officer/farm-zones/setup/_components/SetupMapClient.tsx': {
    allow: { "container.style.backgroundColor = 'white'": 1 },
    reason: "The locate button must match Leaflet's own controls, which leaflet.css keeps white in both themes.",
  },
}

// The source with the exception's allowed snippets removed.
function withoutAllowed(file: string, source: string): string {
  return Object.keys(exceptions[file]?.allow ?? {}).reduce((s, snippet) => s.split(snippet).join(''), source)
}

// Allowed snippets whose number of occurrences differs from the listed count, as `snippet: found/expected`.
function countMismatches(file: string, source: string): string[] {
  return Object.entries(exceptions[file]?.allow ?? {})
    .map(([snippet, count]) => [snippet, source.split(snippet).length - 1, count] as const)
    .filter(([, found, count]) => found !== count)
    .map(([snippet, found, count]) => `${snippet}: ${found}/${count}`)
}

const SRC = join(process.cwd(), 'src')

const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/
const FUNC = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/

// CSS named colours (CSS Color 4), minus transparent/currentColor and the global keywords.
const NAMED_COLORS =
  'aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|' +
  'cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|' +
  'darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|' +
  'darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|' +
  'dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|' +
  'greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|' +
  'lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|' +
  'lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|' +
  'maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|' +
  'mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|' +
  'olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|' +
  'pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|' +
  'seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|' +
  'turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen'
// A named colour as a whole word: `white-space` and `var(--accent-lime)` do not match.
const NAMED = new RegExp(`(?<![\\w-])(?:${NAMED_COLORS})(?![\\w-])`, 'i')
// CSS: the value of a colour property only, never selectors or other properties.
const CSS_COLOR_VALUE =
  /(?<![\w-])(?:color|background(?:-color)?|border(?:-[a-z-]+)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|accent-color|caret-color|text-decoration(?:-color)?)\s*:\s*([^;}]*)/gi
// TSX: quoted values of style keys (object or `el.style.x =`) and of fill/stroke attributes.
const TSX_COLOR_VALUE =
  /(?<![\w-])(?:color|background(?:Color)?|border(?:[A-Z][A-Za-z]*)?|outline(?:Color)?|fill|stroke|boxShadow|textShadow|accentColor|caretColor|textDecorationColor)\s*[:=]\s*\{?\s*(['"`])([^'"`]*)\1/g
const TAILWIND_ARBITRARY_NAMED = new RegExp(`\\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|shadow)-\\[(?:${NAMED_COLORS})\\]`, 'i')

function hasNamedColor(file: string, source: string): boolean {
  if (file.endsWith('.module.css')) return Array.from(source.matchAll(CSS_COLOR_VALUE)).some((m) => NAMED.test(m[1]))
  return (
    TAILWIND_ARBITRARY_NAMED.test(source) || Array.from(source.matchAll(TSX_COLOR_VALUE)).some((m) => NAMED.test(m[2]))
  )
}
const TAILWIND_PALETTE =
  /(?<![\w-])(?:[a-z]+:)*(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|divide|fill|stroke|from|via|to|placeholder|shadow|accent|caret|decoration)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)|white|black)(?:\/\d{1,3})?(?![\w-])/
const TAILWIND_ARBITRARY = /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|shadow)-\[(?:#|rgba?\(|hsla?\()/

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(path)
    return [path]
  })
}

function isScanned(file: string): boolean {
  if (file.endsWith('.module.css')) return true
  return file.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(file)
}

function offends(file: string, source: string): boolean {
  if (HEX.test(source) || FUNC.test(source) || hasNamedColor(file, source)) return true
  return file.endsWith('.tsx') && (TAILWIND_PALETTE.test(source) || TAILWIND_ARBITRARY.test(source))
}

const files = walk(SRC).filter(isScanned).map((f) => relative(process.cwd(), f).split('\\').join('/'))
const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8')
const offenders = files.filter((f) => offends(f, withoutAllowed(f, read(f))))

describe('no hard-coded colours', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('finds no hard-coded colours outside the baseline and exceptions', () => {
    const unexpected = offenders.filter((f) => !baseline.includes(f))
    expect(unexpected).toEqual([])
  })

  it('lists only files that still offend in the baseline', () => {
    expect(baseline.filter((f) => !offenders.includes(f))).toEqual([])
  })

  it('gives every exception a reason and the exact number of each allowed snippet', () => {
    for (const [file, { reason }] of Object.entries(exceptions)) {
      expect([file, reason.trim().length > 10]).toEqual([file, true])
      expect([file, countMismatches(file, read(file))]).toEqual([file, []])
    }
  })

  it('catches an extra or a missing copy of an allowed snippet', () => {
    const file = 'src/components/features/map/ZoneMap.tsx'
    const once = "color: '#00ff00' fillColor: '#00ff00'"
    expect(countMismatches(file, once)).toEqual([])
    expect(countMismatches(file, once + " color: '#00ff00'")).toEqual(["color: '#00ff00': 2/1"])
    expect(countMismatches(file, "fillColor: '#00ff00'")).toEqual(["color: '#00ff00': 0/1"])
  })

  it('still flags other colours in an exception file', () => {
    const file = 'src/components/features/map/ZoneMap.tsx'
    expect(offends(file, withoutAllowed(file, "color: '#00ff00', fill: '#fff'"))).toBe(true)
    expect(offends(file, withoutAllowed(file, "color: '#00ff00'"))).toBe(false)
  })

  it.each([
    ['a.tsx', '<div className="bg-red-500" />'],
    ['a.tsx', '<div className="hover:text-gray-700/80" />'],
    ['a.tsx', '<div className="border-emerald-200" />'],
    ['a.tsx', '<div className="text-white" />'],
    ['a.tsx', '<div className="bg-[#176c4b]" />'],
    ['a.tsx', "const c = '#fff'"],
    ['a.module.css', '.x { color: rgba(0, 0, 0, 0.1); }'],
    ['a.module.css', '.x { color: hsl(120 50% 50%); }'],
    ['a.module.css', '.x { color: #E2E8F0; }'],
    ['a.module.css', '.x { color: oklch(60% 0.1 150); }'],
    ['a.module.css', '.x { background: hwb(120 10% 20%); }'],
    ['a.module.css', '.x{color:white}'],
    ['a.module.css', '.x { background: white; }'],
    ['a.module.css', '.x { border: 1px solid gray; }'],
    ['a.module.css', '.x { box-shadow: 0 0 0 1px Black; }'],
    ['a.module.css', '.x { outline-color: rebeccapurple; }'],
    ['a.tsx', "<p style={{ color: 'red' }} />"],
    ['a.tsx', "<div style={{ borderColor: 'lightgray' }} />"],
    ['a.tsx', "el.style.backgroundColor = 'white'"],
    ['a.tsx', '<path fill="white" />'],
    ['a.tsx', '<path stroke="green" />'],
    ['a.tsx', '<div className="bg-[white]" />'],
  ])('flags %s: %s', (file, source) => {
    expect(offends(file, source)).toBe(true)
  })

  it.each([
    ['a.tsx', '<div className="bg-primary text-muted-foreground border-border" />'],
    ['a.tsx', '<a href="#main">Bỏ qua</a>'],
    ['a.tsx', '<span>&#39;</span>'],
    ['a.tsx', '<div className="text-[var(--color-ink-tertiary)] to-transparent" />'],
    ['a.module.css', '.x { color: var(--color-ink-primary); }'],
    ['a.module.css', '.x { white-space: nowrap; }'],
    ['a.module.css', '.x { background: var(--accent-lime); }'],
    ['a.module.css', '.x { color: currentColor; border-color: transparent; }'],
    ['a.module.css', '.x { outline: none; color: inherit; fill: initial; stroke: unset; }'],
    ['a.module.css', '.white, .red { color: var(--color-danger); }'],
    ['a.tsx', '<path fill="currentColor" stroke="none" />'],
    ['a.tsx', '<div className="white red" data-color="white" />'],
    ['a.tsx', "const label = 'white'"],
    ['a.tsx', "<div style={{ whiteSpace: 'nowrap', color: 'var(--color-danger)' }} />"],
  ])('allows %s: %s', (file, source) => {
    expect(offends(file, source)).toBe(false)
  })
})

// Variables that globals.css does not declare because they are set at runtime, with where.
const RUNTIME_VARIABLES: Record<string, string> = {
  '--font-be-vietnam': 'next/font sets it on <html> in app/layout.tsx',
  '--skeleton-width': 'Skeleton.tsx sets it inline from the width prop',
  '--skeleton-height': 'Skeleton.tsx sets it inline from the height prop',
  '--bar-height': 'chat-interface.tsx sets it inline for each chart bar',
}

// Only :root and the dark blocks count: Tailwind emits an `@theme inline` name only when a utility needs it.
const tokenCss = readFileSync(join(SRC, 'styles/globals.css'), 'utf-8').replace(/@theme\s+inline\s*\{[^}]*\}/, '')
const declared = new Set(Array.from(tokenCss.matchAll(/(--[\w-]+)\s*:/g), (m) => m[1]))

describe('CSS variables', () => {
  it('uses only variables that globals.css declares or that are set at runtime', () => {
    const undefinedUses = files.flatMap((f) =>
      Array.from(read(f).matchAll(/var\(\s*(--[\w-]+)/g), (m) => m[1])
        .filter((name) => !declared.has(name) && !(name in RUNTIME_VARIABLES))
        .map((name) => `${f}: ${name}`),
    )
    expect(Array.from(new Set(undefinedUses))).toEqual([])
  })

  it('lists only runtime variables that globals.css does not declare', () => {
    expect(Object.keys(RUNTIME_VARIABLES).filter((name) => declared.has(name))).toEqual([])
  })

  it('lists only runtime variables that some var() still reads', () => {
    const sources = [readFileSync(join(SRC, 'styles/globals.css'), 'utf-8'), ...files.map(read)]
    const used = new Set(sources.flatMap((s) => Array.from(s.matchAll(/var\(\s*(--[\w-]+)/g), (m) => m[1])))
    expect(Object.keys(RUNTIME_VARIABLES).filter((name) => !used.has(name))).toEqual([])
  })
})
