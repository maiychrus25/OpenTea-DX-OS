// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'

// Every colour must come from a token in src/styles/globals.css (see DESIGN.md).
// `baseline` lists files that still hard-code colours; Task 10 of the Tier 2b plan empties it.
// A file leaves the baseline as soon as it is clean: the test fails if a listed file no longer offends.
const baseline: string[] = [
  'src/app/(auth)/forgot-pin/_components/forgot-pin-form.tsx',
  'src/app/(auth)/forgot-pin/forgot-pin.module.css',
  'src/app/(auth)/register/_components/register-form.tsx',
  'src/app/(auth)/register/register.module.css',
  'src/app/error.tsx',
  'src/app/farmer/bulletin-notifications/page.tsx',
  'src/app/farmer/dashboard/page.tsx',
  'src/app/farmer/diagnosis/_components/DiagnosisClient.tsx',
  'src/app/farmer/diagnosis/diagnosis.module.css',
  'src/app/farmer/journal/_components/FarmerJournalList.tsx',
  'src/app/farmer/journal/journal.module.css',
  'src/app/lot/[lot_code]/_components/TraceView.tsx',
  'src/app/lot/[lot_code]/trace.module.css',
  'src/app/manager/chat/_components/chat-panel.module.css',
  'src/app/manager/dashboard/Dashboard.module.css',
  'src/app/manager/dashboard/page.tsx',
  'src/app/manager/farm-zones/_components/FarmZoneReadOnly.tsx',
  'src/app/manager/journal-approve/_components/ApproveList.tsx',
  'src/app/manager/journal-approve/approve.module.css',
  'src/app/manager/lots/[lot_code]/_components/lot-actions.tsx',
  'src/app/manager/lots/[lot_code]/lot-detail.module.css',
  'src/app/manager/lots/lots.module.css',
  'src/app/manager/lots/page.tsx',
  'src/app/manager/members/_components/invitation-modal.tsx',
  'src/app/manager/members/_components/member-list.tsx',
  'src/app/manager/partners/_components/PartnerList.tsx',
  'src/app/manager/partners/page.tsx',
  'src/app/manager/profile/_components/ProfileForm.tsx',
  'src/app/officer/dashboard/page.tsx',
  'src/app/officer/diseases/[id]/detail.module.css',
  'src/app/officer/diseases/[id]/page.tsx',
  'src/app/officer/diseases/diseases.module.css',
  'src/app/officer/farm-zones/page.tsx',
  'src/app/officer/farm-zones/setup/_components/SetupMapClient.tsx',
  'src/app/officer/farm-zones/setup/_components/setup-wizard.tsx',
  'src/app/officer/farm-zones/setup/_components/step1-household.tsx',
  'src/app/officer/farm-zones/setup/wizard.module.css',
  'src/app/officer/households/[id]/_components/household-profile.tsx',
  'src/app/officer/households/[id]/page.tsx',
  'src/app/officer/households/[id]/soil-health/SoilHealthPageClient.tsx',
  'src/app/officer/households/[id]/soil-health/soil-health-page.module.css',
  'src/app/officer/households/_components/HouseholdManager.tsx',
  'src/app/officer/households/households.module.css',
  'src/app/officer/journal/_components/officer-journal-approval.tsx',
  'src/app/officer/journal/journal.module.css',
  'src/app/officer/lots/lots.module.css',
  'src/app/q/[lot_code]/qr.module.css',
  'src/app/unauthorized/Unauthorized.module.css',
  'src/app/unauthorized/page.tsx',
  'src/components/features/bulletin/BulletinView.module.css',
  'src/components/features/bulletin/CommodityTabs.module.css',
  'src/components/features/bulletin/WeatherSection.tsx',
  'src/components/features/bulletin/bulletin.module.css',
  'src/components/features/certificate/CertificateManager.module.css',
  'src/components/features/certificate/CertificateManager.tsx',
  'src/components/features/document/DocumentView.tsx',
  'src/components/features/map/ZoneMap.module.css',
  'src/components/features/map/ZoneMap.tsx',
  'src/components/features/market/MarketSummaryWidget.module.css',
  'src/components/features/market/MarketSummaryWidget.tsx',
  'src/components/features/notification/notification-inbox.module.css',
  'src/components/features/partner-map/PartnerMap.tsx',
  'src/components/features/partner-map/partner-map.module.css',
  'src/components/features/schedule/HarvestCalendar.module.css',
  'src/components/features/schedule/HarvestCalendar.tsx',
  'src/components/features/soil-health/SoilHealthChart.tsx',
  'src/components/features/soil-health/soil-health.module.css',
  'src/components/layout/NoHtxNotice.tsx',
  'src/components/ui/AiNote/AiNote.module.css',
  'src/components/ui/SourceBox/SourceBox.module.css',
  'src/components/ui/account-section/account-section.module.css',
  'src/components/ui/chat-interface/chat-interface.module.css',
]

// Files that must keep a fixed colour, with the reason. Keep this short.
const exceptions: Record<string, string> = {}

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
const offenders = files.filter((f) => offends(f, readFileSync(join(process.cwd(), f), 'utf-8')))

describe('no hard-coded colours', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('finds no hard-coded colours outside the baseline and exceptions', () => {
    const unexpected = offenders.filter((f) => !baseline.includes(f) && !(f in exceptions))
    expect(unexpected).toEqual([])
  })

  it('lists only files that still offend in the baseline', () => {
    expect(baseline.filter((f) => !offenders.includes(f))).toEqual([])
  })

  it('gives every exception a reason', () => {
    for (const [file, reason] of Object.entries(exceptions)) {
      expect([file, reason.trim().length > 10]).toEqual([file, true])
    }
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
