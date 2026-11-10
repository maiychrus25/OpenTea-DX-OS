// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { BRAND_NAME } from '@/lib/brand'
import { metadata } from '@/app/layout'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : []
  })
}

describe('brand', () => {
  it('is OpenTea DX-OS', () => {
    expect(BRAND_NAME).toBe('OpenTea DX-OS')
  })

  it('names the PWA manifest after the brand', () => {
    const manifest = JSON.parse(read('public/manifest.json'))
    expect(manifest.name).toBe(BRAND_NAME)
    expect(manifest.theme_color).toBe('#176c4b')
  })

  it('titles every page with the brand', () => {
    expect(metadata.title).toEqual({ default: BRAND_NAME, template: `%s | ${BRAND_NAME}` })
  })

  // Case-sensitive on purpose: lower-case `agrimarket` is the Keycloak realm and storage name, never shown.
  it('leaves no old product name in the web source', () => {
    const stale = sourceFiles(join(process.cwd(), 'src')).filter((f) => /AgriMarket/.test(readFileSync(f, 'utf-8')))
    expect(stale).toEqual([])
  })

  it('names the Keycloak login theme after the brand', () => {
    for (const lang of ['en', 'vi']) {
      const messages = read(`../../docker/keycloak/themes/agrimarket/login/messages/messages_${lang}.properties`)
      expect(messages).toMatch(new RegExp(`^loginTitleHtml=${BRAND_NAME}$`, 'm'))
    }
  })

  it.each([
    ['public/icon-192x192.png', 192],
    ['public/icon-512x512.png', 512],
  ])('%s is a real %ipx PNG', (path, size) => {
    const png = readFileSync(join(process.cwd(), path))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size])
  })
})
