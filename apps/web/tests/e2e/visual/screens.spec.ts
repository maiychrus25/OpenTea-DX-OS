// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Priority screens of spec §6.4 at 1280×800 and 390×844, light and dark, on the seeded stack (like tests/e2e/story/tea-a3.spec.ts):
//   E2E_CORE=1 E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/visual/screens.spec.ts --project=chromium --no-deps
// Each run saves test-results/screens/<screen>-<viewport>-<theme>.png and checks for page-level horizontal overflow and overlapping text.
// With E2E_TEA_TOUR=installed (after `./dxos install miniapps/tea-tour`, best after tests/e2e/story/tea-tour.spec.ts so the
// pages hold a tour) it adds the tea-tour pages, and runs the same checks inside the app's frame.
// With E2E_BUSINESS_APPS=installed (leaf-purchase and farm-supply installed with `./dxos install`, tea-shop installed for TC from the
// App Store, best after tests/e2e/story/app-store.spec.ts and business-apps.spec.ts) it adds one screen per business app and role.
import { test, expect, Page } from '@playwright/test'
import { DEMO_PASSWORD, SMOKE_PASSWORD, keycloakLogin } from '../helpers/keycloak-login'

test.skip(!process.env.E2E_CORE, 'Needs the real stack: set E2E_CORE=1')

type Role = 'farmer' | 'officer' | 'manager'
const USERS: Record<Role, [string, string]> = {
  farmer: ['farmer_tc', DEMO_PASSWORD],
  officer: ['smoke_officer_tc', SMOKE_PASSWORD],
  manager: ['smoke_manager_tc', SMOKE_PASSWORD],
}

interface Screen {
  name: string
  role?: Role
  /** Another user of that role, when the screen needs a particular one. */
  user?: [string, string]
  /** The mini-app frame whose document gets the same overflow and overlap checks. */
  frame?: string
  /** Opens the screen and waits for the content that identifies it. */
  open: (page: Page) => Promise<void>
}

async function visit(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
}

const SCREENS: Screen[] = [
  { name: 'farmer-dashboard', role: 'farmer', open: p => visit(p, '/farmer/dashboard', /Chào/) },
  { name: 'farmer-journal', role: 'farmer', open: p => visit(p, '/farmer/journal', 'Nhật ký của tôi') },
  { name: 'farmer-diagnosis', role: 'farmer', open: p => visit(p, '/farmer/diagnosis', 'Chẩn đoán bệnh tự động') },
  { name: 'officer-journal-approval', role: 'officer', open: p => visit(p, '/officer/journal', 'Kiểm tra và phê duyệt nhật ký') },
  { name: 'officer-disease-queue', role: 'officer', open: p => visit(p, '/officer/diseases', 'Danh sách Báo cáo Bệnh cần duyệt') },
  {
    name: 'officer-disease-review', role: 'officer', open: async p => {
      await visit(p, '/officer/diseases', 'Danh sách Báo cáo Bệnh cần duyệt')
      await p.getByRole('button', { name: 'Xem chi tiết & Duyệt' }).first().click()
      await expect(p.getByRole('heading', { name: 'Chi tiết Báo cáo bệnh' })).toBeVisible()
    },
  },
  {
    name: 'officer-lot-create', role: 'officer', open: async p => {
      await visit(p, '/officer/lots', 'Quản lý Lô hàng')
      await p.getByRole('button', { name: '+ Tạo lô mới' }).click()
      await expect(p.getByLabel('TC-A2 — Chè LDP1')).toBeVisible()
    },
  },
  { name: 'manager-dashboard', role: 'manager', open: p => visit(p, '/manager/dashboard', /./) },
  { name: 'manager-app-store', role: 'manager', open: p => visit(p, '/manager/app-store', 'Kho ứng dụng') },
  { name: 'public-qr-trace', open: p => visit(p, '/q/TC-CHE-A3-001', 'Chè') },
  // The page the printed QR code opens (ExportQrUseCase encodes /lot/<code>).
  { name: 'public-lot-trace', open: p => visit(p, '/lot/TC-CHE-A3-001', 'Truy xuất nguồn gốc') },
]

const TEA_TOUR_FRAME = 'iframe[title="Đặt tour đồi chè"]'

async function visitApp(page: Page, path: string, heading: string, frame = TEA_TOUR_FRAME) {
  await page.goto(path)
  await expect(page.frameLocator(frame).getByRole('heading', { name: heading, level: 1 })).toBeVisible()
}

if (process.env.E2E_TEA_TOUR === 'installed') {
  SCREENS.push(
    { name: 'tea-tour-manager-list', role: 'manager', frame: TEA_TOUR_FRAME, open: p => visitApp(p, '/manager/apps/tea-tour', 'Tour đồi chè HTX TC') },
    { name: 'tea-tour-public', open: p => visit(p, '/apps/tea-tour/public/TC', 'Tour đồi chè HTX TC') },
    {
      // smoke_farmer_tc guides the story's tours (household hh_tc_1); the demo farmer guides none.
      name: 'tea-tour-guide', role: 'farmer', user: ['smoke_farmer_tc', SMOKE_PASSWORD], frame: TEA_TOUR_FRAME,
      open: p => visitApp(p, '/farmer/apps/tea-tour/guide', 'Lịch dẫn tour'),
    },
  )
}

if (process.env.E2E_BUSINESS_APPS === 'installed') {
  const LEAF = 'iframe[title="Thu mua búp tươi"]'
  const SHOP = 'iframe[title="Cửa hàng chè"]'
  const SUPPLY = 'iframe[title="Vật tư mua chung"]'
  // smoke_farmer_tc owns household hh_tc_1, which the apps need to find through Hasura; the demo farmer is not linked to one.
  const farmer: [string, string] = ['smoke_farmer_tc', SMOKE_PASSWORD]
  SCREENS.push(
    { name: 'leaf-purchase-officer', role: 'officer', frame: LEAF, open: p => visitApp(p, '/officer/apps/leaf-purchase', 'Thu mua búp tươi', LEAF) },
    { name: 'leaf-purchase-manager', role: 'manager', frame: LEAF, open: p => visitApp(p, '/manager/apps/leaf-purchase/periods', 'Kỳ thanh toán', LEAF) },
    { name: 'leaf-purchase-farmer', role: 'farmer', user: farmer, frame: LEAF, open: p => visitApp(p, '/farmer/apps/leaf-purchase/mine', 'Phiếu cân của tôi', LEAF) },
    { name: 'tea-shop-manager', role: 'manager', frame: SHOP, open: p => visitApp(p, '/manager/apps/tea-shop', 'Cửa hàng chè HTX TC', SHOP) },
    { name: 'tea-shop-public', open: p => visit(p, '/apps/tea-shop/public/TC', 'Cửa hàng chè HTX TC') },
    { name: 'farm-supply-manager', role: 'manager', frame: SUPPLY, open: p => visitApp(p, '/manager/apps/farm-supply', 'Vật tư mua chung HTX TC', SUPPLY) },
    { name: 'farm-supply-farmer', role: 'farmer', user: farmer, frame: SUPPLY, open: p => visitApp(p, '/farmer/apps/farm-supply/mine', 'Đăng ký vật tư', SUPPLY) },
  )
}

const VIEWPORTS = [
  { name: '1280', width: 1280, height: 800 },
  { name: '390', width: 390, height: 844 },
]
const THEMES = ['light', 'dark'] as const

interface Overlap { a: string; b: string }

/**
 * Pairs of visible text fragments whose boxes cross. A fragment is one line box of a text node (Range.getClientRects),
 * clipped by every ancestor that hides overflow, so ellipsis, scroll areas and visually hidden text do not count.
 * Fixed and sticky subtrees (top bar, modal, drawer) are their own layer: an intended overlay is compared only with
 * itself. Map and chart SVG text is skipped. Two lines of glyph boxes touch when the line height is tight, so a pair
 * counts only when it shares more than 2 px horizontally and 40 % of the shorter box vertically.
 */
function findTextOverlaps(): Overlap[] {
  type Box = { l: number; t: number; r: number; b: number }
  const clipBoxes = new Map<Element, Box>()
  const clipOf = (el: Element): Box => {
    const cached = clipBoxes.get(el)
    if (cached) return cached
    const style = getComputedStyle(el)
    const parent = el.parentElement && style.position !== 'fixed' ? clipOf(el.parentElement) : { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity }
    let box = parent
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible' || style.clipPath !== 'none' || style.clip !== 'auto') {
      const own = el.getBoundingClientRect()
      box = { l: Math.max(parent.l, own.left), t: Math.max(parent.t, own.top), r: Math.min(parent.r, own.right), b: Math.min(parent.b, own.bottom) }
    }
    clipBoxes.set(el, box)
    return box
  }
  const layerOf = (el: Element): Element | null => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const position = getComputedStyle(e).position
      if (position === 'fixed' || position === 'sticky') return e
    }
    return null
  }

  const fragments: { box: Box; node: Text; layer: Element | null; label: string }[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const text = node.textContent?.trim()
    const parent = node.parentElement
    if (!text || !parent || parent.closest('svg, script, style, noscript, .leaflet-container')) continue
    if (!parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const clip = clipOf(parent)
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const rect of Array.from(range.getClientRects())) {
      const box = { l: Math.max(rect.left, clip.l), t: Math.max(rect.top, clip.t), r: Math.min(rect.right, clip.r), b: Math.min(rect.bottom, clip.b) }
      if (box.r - box.l < 1 || box.b - box.t < 1) continue
      fragments.push({ box, node, layer: layerOf(parent), label: `${parent.tagName.toLowerCase()} "${text.slice(0, 40)}"` })
    }
  }

  const overlaps: Overlap[] = []
  for (let i = 0; i < fragments.length; i++) {
    for (let j = i + 1; j < fragments.length; j++) {
      const a = fragments[i]
      const b = fragments[j]
      if (a.node === b.node || a.layer !== b.layer) continue
      const width = Math.min(a.box.r, b.box.r) - Math.max(a.box.l, b.box.l)
      const height = Math.min(a.box.b, b.box.b) - Math.max(a.box.t, b.box.t)
      const shorter = Math.min(a.box.b - a.box.t, b.box.b - b.box.t)
      if (width > 2 && height > 0.4 * shorter) overlaps.push({ a: a.label, b: b.label })
    }
  }
  return overlaps
}

for (const screen of SCREENS) {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${screen.name} ${viewport.name} ${theme}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: theme })
        const page = await context.newPage()
        if (screen.role) await keycloakLogin(page, ...(screen.user ?? USERS[screen.role]), screen.role)
        await screen.open(page)
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
        // No stored theme choice, so the page follows prefers-color-scheme from the context.
        await page.evaluate(() => document.fonts.ready)

        await page.screenshot({ path: `test-results/screens/${screen.name}-${viewport.name}-${theme}.png`, fullPage: true })

        const documents = [page.mainFrame()]
        if (screen.frame) {
          const frame = await (await page.locator(screen.frame).elementHandle())?.contentFrame()
          if (!frame) throw new Error(`No frame ${screen.frame}`)
          documents.push(frame)
        }
        for (const doc of documents) {
          const widths = await doc.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
          expect(widths.scroll, `page-level horizontal overflow in ${doc.url()}: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(widths.inner)
          expect(await doc.evaluate(findTextOverlaps), `overlapping text in ${doc.url()}`).toEqual([])
        }

        if (screen.role && viewport.name === '390') {
          // The signed-in top bar keeps the theme toggle on a phone, inside the screen and clear of the other controls.
          const toggle = page.getByRole('button', { name: /^Giao diện:/ })
          await expect(toggle).toBeVisible()
          const crossing = await toggle.evaluate((button) => {
            const own = button.getBoundingClientRect()
            const bar = button.closest('header')
            const others = Array.from(bar?.querySelectorAll('button, a') ?? []).filter(e => e !== button && !e.contains(button))
            return {
              inside: own.left >= 0 && own.right <= window.innerWidth,
              crossing: others.map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.left < own.right && r.right > own.left && r.top < own.bottom && r.bottom > own.top).length,
            }
          })
          expect(crossing).toEqual({ inside: true, crossing: 0 })
          // The brand stays on one line ("OpenTea DX-OS" used to break after the hyphen).
          const brandLines = await page.locator('header span', { hasText: 'OpenTea DX-OS' }).first().evaluate((span) => {
            const range = document.createRange()
            range.selectNodeContents(span)
            return new Set(Array.from(range.getClientRects()).map(r => Math.round(r.top))).size
          })
          expect(brandLines).toBe(1)
        }
        await context.close()
      })
    }
  }
}
