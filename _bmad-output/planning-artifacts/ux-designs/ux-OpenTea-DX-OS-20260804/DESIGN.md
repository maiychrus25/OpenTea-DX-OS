---
name: DX-AgriMarket
description: Agricultural Digital Operating System for Vietnamese farming cooperatives — synthesizes global market intelligence and farm traceability into a single source of truth.
status: final
updated: 2026-08-04
sources:
  - _bmad-output/planning-artifacts/prd-dx-agrimarket-20260804/prd.md
  - _bmad-output/planning-artifacts/architecture-dx-agrimarket-20260804/ARCHITECTURE-SPINE.md
colors:
  # ── Primary brand ─────────────────────────────────────────────
  primary:              '#16A34A'
  primary-hover:        '#15803D'
  primary-subtle:       '#DCFCE7'
  primary-foreground:   '#FFFFFF'

  # ── Accent ────────────────────────────────────────────────────
  accent:               '#EA580C'
  accent-hover:         '#C2410C'
  accent-subtle:        '#FFF7ED'
  accent-foreground:    '#FFFFFF'

  # ── Parcel / Lot status (closed semantic set) ─────────────────
  status-sowing:           '#16A34A'
  status-tending:          '#CA8A04'
  status-harvest-approved: '#EA580C'
  status-harvested:        '#2563EB'
  status-draft:            '#6B7280'

  # ── Semantic feedback ─────────────────────────────────────────
  success:        '#16A34A'
  warning:        '#D97706'
  danger:         '#DC2626'
  info:           '#2563EB'
  success-subtle: '#DCFCE7'
  warning-subtle: '#FEF3C7'
  danger-subtle:  '#FEE2E2'
  info-subtle:    '#DBEAFE'

  # ── Neutral surfaces ──────────────────────────────────────────
  surface-page:    '#F8FAFC'
  surface-card:    '#FFFFFF'
  surface-sunken:  '#F1F5F9'
  surface-overlay: '#FFFFFF'

  border-subtle:  '#E2E8F0'
  border-default: '#CBD5E1'
  border-focus:   '#16A34A'

  ink-primary:   '#0F172A'
  ink-secondary: '#475569'
  ink-tertiary:  '#94A3B8'
  ink-inverse:   '#FFFFFF'

  map-overlay:   'rgba(15,23,42,0.55)'
  badge-unread:  '#DC2626'

typography:
  display:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: '2rem'
    fontWeight: '700'
    lineHeight: '1.25'
    letterSpacing: '-0.02em'
  heading-1:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: '1.5rem'
    fontWeight: '700'
    lineHeight: '1.3'
    letterSpacing: '-0.01em'
  heading-2:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: '1.25rem'
    fontWeight: '600'
    lineHeight: '1.35'
  heading-3:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: '1rem'
    fontWeight: '600'
    lineHeight: '1.4'
  body:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: '0.9375rem'
    fontWeight: '400'
    lineHeight: '1.6'
  body-large:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: '1.0625rem'
    fontWeight: '400'
    lineHeight: '1.6'
  label:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: '0.875rem'
    fontWeight: '500'
    lineHeight: '1.4'
  meta:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: '0.75rem'
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0.01em'
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    fontSize: '0.8125rem'
    fontWeight: '400'
    lineHeight: '1.5'

rounded:
  sm:   '6px'
  md:   '10px'
  lg:   '14px'
  xl:   '20px'
  full: '9999px'

spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '8': '32px'
  '10': '40px'
  '12': '48px'
  '16': '64px'
  gutter-mobile:  '16px'
  gutter-desktop: '24px'
  sidebar-width:  '240px'
  topbar-height:  '56px'

components:
  button-primary:
    background:   '{colors.primary}'
    color:        '{colors.primary-foreground}'
    borderRadius: '{rounded.md}'
    paddingX:     '{spacing.5}'
    paddingY:     '{spacing.3}'
    fontSize:     '{typography.label.fontSize}'
    fontWeight:   '{typography.label.fontWeight}'
    shadow:       '0 1px 3px rgba(22,163,74,0.25)'
  button-primary-hover:
    background:   '{colors.primary-hover}'
    shadow:       '0 2px 6px rgba(22,163,74,0.35)'
  button-accent:
    background:   '{colors.accent}'
    color:        '{colors.accent-foreground}'
    borderRadius: '{rounded.md}'
  button-ghost:
    background:   'transparent'
    color:        '{colors.ink-secondary}'
    border:       '1px solid {colors.border-default}'
  button-danger:
    background:   '{colors.danger}'
    color:        '#FFFFFF'

  card:
    background:   '{colors.surface-card}'
    borderRadius: '{rounded.md}'
    border:       '1px solid {colors.border-subtle}'
    shadow:       '0 1px 4px rgba(15,23,42,0.06)'
    padding:      '{spacing.6}'
  card-hover:
    shadow:       '0 4px 16px rgba(15,23,42,0.10)'
    borderColor:  '{colors.border-default}'

  input:
    background:       '{colors.surface-sunken}'
    border:           '1px solid {colors.border-default}'
    borderRadius:     '{rounded.sm}'
    color:            '{colors.ink-primary}'
    fontSize:         '{typography.body.fontSize}'
    paddingX:         '{spacing.3}'
    paddingY:         '{spacing.3}'
    placeholderColor: '{colors.ink-tertiary}'
  input-focus:
    border:           '2px solid {colors.border-focus}'
    background:       '{colors.surface-card}'
    shadow:           '0 0 0 3px rgba(22,163,74,0.12)'

  badge-sowing:
    background:   '{colors.primary-subtle}'
    color:        '{colors.primary}'
    borderRadius: '{rounded.full}'
    fontWeight:   '600'
    fontSize:     '{typography.meta.fontSize}'
  badge-tending:
    background:   '#FEF3C7'
    color:        '#92400E'
  badge-harvest-approved:
    background:   '{colors.accent-subtle}'
    color:        '{colors.accent}'
  badge-harvested:
    background:   '{colors.info-subtle}'
    color:        '{colors.info}'
  badge-draft:
    background:   '#F1F5F9'
    color:        '{colors.ink-secondary}'

  notification-bell:
    iconColor:       '{colors.ink-secondary}'
    badgeBackground: '{colors.badge-unread}'
    badgeColor:      '#FFFFFF'
    badgeSize:       '18px'

  sidebar-item:
    borderRadius: '{rounded.sm}'
    paddingX:     '{spacing.3}'
    paddingY:     '{spacing.2}'
    color:        '{colors.ink-secondary}'
    fontSize:     '{typography.label.fontSize}'
  sidebar-item-active:
    background:   '{colors.primary-subtle}'
    color:        '{colors.primary}'
    fontWeight:   '600'

  tts-button:
    background:   '{colors.primary-subtle}'
    color:        '{colors.primary}'
    borderRadius: '{rounded.full}'
    paddingX:     '{spacing.4}'
    paddingY:     '{spacing.2}'
    fontSize:     '{typography.label.fontSize}'

  chat-bubble-user:
    background:   '{colors.primary}'
    color:        '{colors.primary-foreground}'
    borderRadius: '18px 18px 4px 18px'
  chat-bubble-ai:
    background:   '{colors.surface-sunken}'
    color:        '{colors.ink-primary}'
    borderRadius: '4px 18px 18px 18px'

  withdrawal-passed:
    background:  '{colors.primary-subtle}'
    borderLeft:  '4px solid {colors.primary}'
    color:       '{colors.primary}'
  withdrawal-pending:
    background:  '{colors.warning-subtle}'
    borderLeft:  '4px solid {colors.warning}'
    color:       '#92400E'
---
## Brand & Style

DX-AgriMarket is not a consumer app — it is an operating layer for a working cooperative. Its aesthetic must earn the trust of two very different audiences simultaneously: the HTX Manager who opens it on a smartphone before a price negotiation, and the Technical Officer who uses it on a laptop to manage 120 parcels across a full growing season.

The visual language is **grounded precision** — the clarity of a well-kept field record, not the dopamine-engineered density of a fintech dashboard. Every element earns its place by serving a task. The product is confident, not flashy; warm, not clinical.

**Agricultural green (`#16A34A`) is the brand anchor.** The color of healthy crop growth — it signals "working, good, safe." It appears on primary actions, active navigation, and Sowing status. Never decorative.

**Harvest orange (`#EA580C`) is the urgency accent.** Used only where the user takes an irreversible high-stakes action (Approve Harvest, Export QR) or where the system marks a transition to Harvest-Approved. Warm and grounded — not alarm-red, not generic-amber.

The four **parcel status colors** (Green / Amber / Orange / Blue) form a closed semantic system. They appear on map polygons, status badges, and progress summaries. These colors are not available for any other semantic use.

Typography is **Inter** — workhorse typeface with excellent Vietnamese diacritic rendering, strong legibility at small mobile sizes, and OFL open-source license. The Farmer role defaults to `body-large` (17px) for accessibility without requiring separate components.

Overall posture: **data-first, calm hierarchy**. Dense information in clear cards and tables — never hidden behind unnecessary modals.

## Colors

**Primary Green (`#16A34A`)** — Primary action buttons, active sidebar items, focus rings, Sowing status, success feedback. Subtle variant (`#DCFCE7`) for badge backgrounds and success banners. Never decorative fill.

**Harvest Orange (`#EA580C`)** — Only: Export QR button, Approve Harvest button, Harvest-Approved badge, accent on QR step wizard. Never on secondary actions or navigation.

**Parcel Status Set (closed):**

- Green → Sowing; Amber → Tending; Orange → Harvest-Approved; Blue → Harvested

Map polygon fills: status color at 40% opacity fill, 100% stroke — keeps street labels readable beneath polygons.

**Neutrals:** Three-level surface system — `surface-page` (F8FAFC) canvas, `surface-card` (white) content panels, `surface-sunken` (F1F5F9) inputs and sunken sections. Hierarchy via tone, not shadow depth.

**Citation ink:** Source strings use `ink-tertiary` + `mono` font — "(Nguồn: USDA, 23/07/2026)" renders as visually distinct metadata without competing with main content.

Avoid: gradients on interactive surfaces, status colors repurposed as decoration, red error fills where amber warning is sufficient.

## Typography

**Inter** via Google Fonts (OFL license). Load: `<link rel="preconnect">` + `display=swap`.

Vietnamese character set renders fully at every weight with no fallback degradation.

- `display` (32px, 700) — Bulletin headline only. One per page.
- `heading-1` (24px, 700) — Page title
- `heading-2` (20px, 600) — Card headings, section titles
- `heading-3` (16px, 600) — Sub-headings, form group labels
- `body` (15px, 400) — All content: Manager and Officer roles
- `body-large` (17px, 400) — **Farmer role** — set via `[data-role="farmer"]` on layout root, inherited by all child elements
- `label` (14px, 500) — Form labels, table headers, tag text
- `meta` (12px, 400) — Timestamps, parcel codes, lot codes, "last synced"
- `mono` (13px, JetBrains Mono) — Lot codes, API source citations, withdrawal day counts

## Layout & Spacing

Breakpoints: `sm` 375px · `md` 768px · `lg` 1024px · `xl` 1280px.

**Layout per role:**

- Manager & Officer: Sidebar (240px fixed) + fluid content on `lg+`; bottom nav on mobile.
- Farmer: Single-column always. Bottom nav: Today / Journal / Diagnose. No sidebar ever.
- Public QR page: Single-column, no nav chrome, max-width 640px centered.

Spacing base unit: 4px. All spacing in multiples of 4. Card internal padding: 24px desktop / 16px mobile.

## Elevation & Depth

Three levels:

1. Page canvas — no shadow
2. Cards and panels — `0 1px 4px rgba(15,23,42,0.06)`
3. Overlays (modal, drawer, dropdown) — `0 8px 32px rgba(15,23,42,0.16)`

Shadows are semantic, not decorative. Hover state: border-color change only, no shadow increase.

The map overlay panel (parcel detail drawer over Leaflet) uses overlay shadow level, floating above the map canvas without obscuring it.

## Shapes

- `rounded.sm` (6px) — badges, tags, inputs, table row highlights
- `rounded.md` (10px) — cards, dropdowns, tooltips, sidebar items
- `rounded.lg` (14px) — modals, side drawers, QR step wizard panel
- `rounded.xl` (20px) — TTS listen button, large action chips
- `rounded.full` (9999px) — status dots, notification badge, avatar circles

## Components

**Primary Button** — Green fill. One per screen maximum. Min 44×44px tap target.

**Accent Button (Harvest Orange)** — "Phê duyệt thu hoạch" and "Xuất QR" only. Signals irreversible, high-stakes transition.

**Ghost Button** — Border + secondary text. Secondary actions alongside a primary button.

**Status Badge** — Pill shape, `meta` font, 600 weight. Closed set: Sowing / Tending / Harvest-Approved / Harvested / Draft.

**Card** — All feature content. 24px desktop padding / 16px mobile. No card-in-card nesting — use section dividers instead.

**Sidebar Item** — 14px label, 36px height, green-tinted active state. Icon (24×24) left of label.

**Notification Bell** — TopBar bell icon. Red dot badge when unread > 0. Click opens right-anchored dropdown panel, not page navigation.

**TTS "Nghe" Button** — Green-tinted pill on: Bulletin header, Notification item rows, Disease diagnosis result. Hidden entirely (not disabled) when Piper is unavailable.

**Chat Bubble** — User: right-aligned, green fill. AI: left-aligned, sunken fill. AI message always includes citation footer in `meta` + `mono` style.

**Withdrawal Status Block** — Left-border card: green border = PASSED, amber border = NOT YET. "Phê duyệt thu hoạch" button appears only inside PASSED block.

**QR Step Wizard** — Horizontal 6-step indicator at top of Lot creation flow. Non-clickable. Active: green dot + label. Completed: checkmark. Upcoming: gray dot.

**Map Polygon Fills:**

```
Sowing:           fillColor '#16A34A', fillOpacity 0.4, color '#15803D', weight 2
Tending:          fillColor '#CA8A04', fillOpacity 0.4, color '#A16207', weight 2
Harvest-Approved: fillColor '#EA580C', fillOpacity 0.4, color '#C2410C', weight 2
Harvested:        fillColor '#2563EB', fillOpacity 0.4, color '#1D4ED8', weight 2
```

## Do's and Don'ts

| Do                                                    | Don't                                                 |
| ----------------------------------------------------- | ----------------------------------------------------- |
| One primary green button per screen max               | Multiple green buttons competing for attention        |
| Status color set only for parcel/lot status           | Repurpose green/amber/orange/blue for non-status UI   |
| AI citations in`mono` meta style, below each claim  | Inline citations in prose — they break reading flow  |
| `body-large` (17px) for Farmer role via layout root | Separate "farmer mode" component variants             |
| Left-border card for safety/withdrawal status blocks  | Full background fills — too visually heavy           |
| Hide TTS button when Piper unavailable                | Show TTS as disabled/grayed — implies broken feature |
| 44px minimum tap targets on mobile                    | Small icon-only buttons without adequate touch area   |
| Polygon fill at 40% opacity                           | Full-opacity fills obscuring map labels beneath       |
| Single-column for Farmer always                       | Sidebar or two-column layout on mobile for any role   |
| Lot codes in`mono` typeface                         | Lot codes in regular body font<br />Don't use icon    |
