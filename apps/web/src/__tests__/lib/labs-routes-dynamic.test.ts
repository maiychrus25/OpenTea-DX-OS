// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import fs from 'node:fs'
import path from 'node:path'

// A GET route that answers from DXOS_LABS without touching the request is prerendered at build time,
// so the switch would be frozen into the build. Every gated route must render on each request.
const APP_DIR = path.resolve(__dirname, '../../app')

function gatedRouteFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return gatedRouteFiles(full)
    return entry.name === 'route.ts' && fs.readFileSync(full, 'utf8').includes('labsOnly') ? [full] : []
  })
}

describe('routes gated by DXOS_LABS', () => {
  const files = gatedRouteFiles(APP_DIR)

  test('there are gated routes to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test.each(files.map((file) => [path.relative(APP_DIR, file), file]))('%s renders on every request', (_name, file) => {
    expect(fs.readFileSync(file, 'utf8')).toMatch(/export const dynamic = 'force-dynamic'/)
  })
})
