---
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
version: alpha
name: Tour đồi chè (customer site)
description: Delta of the root DESIGN.md for the public site of a tea cooperative. Same palette and Be Vietnam Pro; this file adds the destination-website layer (hero, photo cards, booking card, boarding-pass ticket). Source of truth in code is static/site.css on top of static/tokens.css.
inherits: ../../DESIGN.md
colors:
  tea-deep: "#0f3b2a"
  tea-deep-dark: "#071d14"
  hero-scrim-top: "rgba(7, 29, 20, 0.15)"
  hero-scrim-bottom: "rgba(7, 29, 20, 0.82)"
  bud: "#d6f05c"
  bud-dark: "#c9e157"
  paper: "#fbfaf4"
  paper-dark: "#0f1f17"
  ticket-stub: "#f3efe0"
  ticket-stub-dark: "#15291f"
  star: "#c27a0a"
  star-dark: "#f2b544"
typography:
  display: { family: Be Vietnam Pro, size: "clamp(2rem, 6vw, 3.5rem)", weight: 700, lineHeight: 1.1, tracking: "-0.02em" }
  h1: { size: "clamp(1.75rem, 4vw, 2.5rem)", weight: 700, lineHeight: 1.2 }
  h2: { size: "clamp(1.375rem, 3vw, 1.875rem)", weight: 700, lineHeight: 1.25 }
  h3: { size: 1.125rem, weight: 600, lineHeight: 1.35 }
  lead: { size: 1.125rem, weight: 400, lineHeight: 1.6 }
  body: { size: 1rem, weight: 400, lineHeight: 1.65 }
  eyebrow: { size: 0.8125rem, weight: 600, tracking: "0.08em", transform: uppercase }
spacing:
  section: "48px mobile, 64px desktop"
  gutter: "16px mobile, 24px desktop"
  content-max: 1160px
  reading-max: 68ch
rounded:
  card: 20px
  control: 12px
  chip: 9999px
  hero-bottom: 28px
elevation:
  card: "0 1px 2px rgba(15,23,42,.06), 0 8px 24px -12px rgba(15,23,42,.18)"
  card-hover: "0 2px 4px rgba(15,23,42,.08), 0 16px 32px -14px rgba(15,23,42,.28)"
  sticky: "0 -6px 24px -12px rgba(15,23,42,.35)"
components:
  button-primary: { background: "{colors.primary}", color: "{colors.primary-foreground}", height: 48px, radius: "{rounded.control}", weight: 600 }
  button-secondary: { background: transparent, border: 1px solid border-default, height: 48px }
  input: { height: 48px, radius: "{rounded.control}", border: 1px solid border-default, focus: 3px outline primary }
  tour-card: { photo: 4/3, radius: "{rounded.card}", chip: top-left on photo, hover: lift 2px + elevation.card-hover }
  booking-card: { sticky: desktop right column at top 88px, mobile: bottom bar with price and "Chọn ngày" }
  ticket: { layout: boarding pass, stub: right on desktop and below on mobile, perforation: dashed rule with half-circle notches }
---

# Tour đồi chè: giao diện trang khách

## Intent

The cooperative's site must look like a place a stranger would trust with a deposit. The previous version was a plain
list; this one is a destination website: a large honest photograph at the top, a clear path from "I like this" to
"it is booked", and money handled in calm, legible blocks. It inherits the root palette (tea green `#176c4b`, bud lime,
amber for warnings) and Be Vietnam Pro, and adds only what a public, photo-led site needs.

## Principles

1. **Photo first, text second.** Home hero, tour cards and the tour gallery lead with photography. A tour without a photo
   gets one of five layered tea-hill illustrations (own drawings, MIT) so no card is ever grey.
2. **One primary action per view.** "Đặt tour" in the header, "Chọn ngày" in the tour bottom bar, "Xác nhận đặt chỗ" on
   step 2, "Tôi đã chuyển khoản" on the booking page. Everything else is secondary or a text link.
3. **Money is quiet and exact.** Totals use tabular figures, deposits and deadlines sit in their own labelled rows. The
   transfer details (bank, account, holder, amount, content) are plain selectable text next to the QR, never only in the image.
4. **Rhythm.** Sections are separated by 48 px (mobile) and 64 px (desktop); cards use 20 px padding on mobile and 24 px on
   desktop; text columns never exceed 68 characters.
5. **No script, no cookies.** Navigation on mobile is a `<details>`; the FAQ is `<details>`; the gallery is a CSS
   scroll-snap strip; the booking is three plain forms. Motion is limited to hover lifts and colour transitions (150 to 200 ms)
   and is switched off under `prefers-reduced-motion`.

## Layout

- **Header** (sticky, 64 px): cooperative name left, links "Tour", "Tra cứu", "Liên hệ", primary "Đặt tour" right. Below
  720 px the links move into a `<details>` menu; the primary button stays visible.
- **Home:** hero (min-height 560 px desktop, 480 px mobile; cover photo with a bottom scrim; display heading, tagline,
  two buttons, a row of three trust facts), featured tours (grid 3 / 2 / 1), "Đặt tour trong 3 bước" (numbered cards),
  reviews (cards with stars and the cooperative reply), contact card (hotline, Zalo, email, address, map), footer.
- **Catalogue:** filter bar (category chips as links, month select, sort select with an "Áp dụng" button), 12 cards per page.
- **Tour page:** desktop two columns (content 1fr, booking card 360 px sticky); mobile single column with a fixed bottom
  bar (from-price + "Chọn ngày"). Gallery: 16:9 scroll-snap strip, thumbnail links below. Itinerary is a vertical timeline;
  includes / excludes with check and cross icons; departures as a table that becomes stacked rows at 390 px.
- **Booking:** a three-step indicator (Chọn chuyến, Xác nhận, Hoàn tất), single column up to 720 px, form on the left and a
  summary card on the right from 960 px. Inputs are 48 px high.
- **My booking:** status timeline across the top, then a two-column body (details and actions left, payment card right).
- **Ticket:** boarding pass, 720 px wide, stub with the QR; prints on one A4 page with header, footer and buttons removed.

## Colour

Light uses `paper` (`#fbfaf4`) for the page and white cards; dark uses `paper-dark` and the root dark card colour. Text
on photographs always sits on the hero scrim (top 0.15, bottom 0.82 of `tea-deep`) so contrast stays above 4.5:1 on any
upload. Status colours reuse root tokens: success (confirmed, paid), warning (pending, deposit due), danger (cancelled,
refund). Stars use `star`, never primary green.

## Responsive and accessibility

- 390 px is the design width; 1280 px the check width. No horizontal page scroll: wide content (tables, QR text) wraps or
  scrolls inside its own `.table-scroll`.
- Tap targets at least 44 px; inputs 48 px; `:focus-visible` outline 3 px primary on every link, button and field.
- Every input has a visible `<label>`; errors sit under the field with `role="alert"` and the field gets `aria-invalid`.
- Images carry `alt` (tour title) or empty alt when decorative; icons are `aria-hidden`.
- Empty states: no tours (cooperative has nothing published), no departures ("Chưa có chuyến sắp tới. Gửi yêu cầu tour riêng"),
  no reviews, filter without results with a "Xoá bộ lọc" link.

## Do and don't

- Do keep one cover aspect (4:3 on cards, 16:9 in the gallery, 21:9 hero on desktop) so a page never jumps.
- Do show seats left only as "Còn N chỗ"; never expose another guest's name, phone or email.
- Don't use inline `style`, script, external fonts or remote images (CSP).
- Don't use the lime accent for text on white; it is for fills behind dark text only.
