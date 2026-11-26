// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { detailButton, editButton, miniAppBaseUrl, openAppButton } from '@/application/telegram/chat/mini-app'
import { menuKeyboard } from '@/application/telegram/chat/menu'

const env = { ...process.env }
afterEach(() => { process.env = { ...env } })

describe('Mini App buttons (C4)', () => {
  describe('without an HTTPS web address', () => {
    it.each([undefined, '', 'http://dxos.local'])('shows none (%s)', (url) => {
      if (url === undefined) delete process.env.DXOS_WEB_PUBLIC_URL
      else process.env.DXOS_WEB_PUBLIC_URL = url
      expect(miniAppBaseUrl()).toBeNull()
      expect(openAppButton()).toBeNull()
      expect(editButton('journal.create', { parcel_id: 'p1' }, 'farmer')).toBeNull()
      expect(detailButton('pid')).toBeNull()
      expect(menuKeyboard('farmer', 'k').flat().map((b) => b.text)).not.toContain('Mở ứng dụng')
    })
  })

  describe('with an HTTPS web address', () => {
    beforeEach(() => { process.env.DXOS_WEB_PUBLIC_URL = 'https://dxos.example.org/' })

    it('adds Mở ứng dụng as the last menu row for every role', () => {
      for (const role of ['farmer', 'officer', 'manager'] as const) {
        const rows = menuKeyboard(role, 'k')
        expect(rows[rows.length - 1]).toEqual([{ text: 'Mở ứng dụng', web_app: { url: 'https://dxos.example.org/telegram/open' } }])
      }
    })

    it('Sửa of a farmer journal card opens the prefilled form through /telegram/open', () => {
      const button = editButton('journal.create', { parcel_id: 'p1', activity_type: 'SPRAYING', product_name: 'Regent 800WG', dosage: '20 ml', withdrawal_days: 7 }, 'farmer')!
      const url = new URL((button as { web_app: { url: string } }).web_app.url)
      expect(button.text).toBe('Sửa')
      expect(url.pathname).toBe('/telegram/open')
      const to = new URL(url.searchParams.get('to')!, 'https://x')
      expect(to.pathname).toBe('/farmer/journal/new')
      expect(Object.fromEntries(to.searchParams)).toEqual({ parcel: 'p1', activity: 'SPRAYING', product: 'Regent 800WG', dosage: '20 ml', withdrawal: '7' })
    })

    it('omits empty fields, and a kind or role with no form gets no Sửa (Review Focus 5)', () => {
      const url = (editButton('journal.create', { parcel_id: 'p1', activity_type: 'OTHER' }, 'farmer') as { web_app: { url: string } }).web_app.url
      expect(decodeURIComponent(url)).toContain('/farmer/journal/new?parcel=p1&activity=OTHER')
      expect(decodeURIComponent(url)).not.toContain('product')
      expect(editButton('harvest.approve', { parcel_id: 'p1' }, 'manager')).toBeNull()
      expect(editButton('journal.create', { parcel_id: 'p1' }, 'officer')).toBeNull()
      expect(editButton('disease.report', {}, 'farmer')).toBeNull()
    })

    it('Mở chi tiết opens the proposal in the manager inbox', () => {
      const url = (detailButton('pid-1') as { web_app: { url: string } }).web_app.url
      expect(decodeURIComponent(url)).toBe('https://dxos.example.org/telegram/open?to=/manager/ai?proposal=pid-1')
    })
  })
})
