// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** @jest-environment node */

import fs from 'fs'
import path from 'path'

const WEB_ROOT = path.resolve(__dirname, '../../..')
const RICE_WORDS = /lúa|gạo|ST25|Hè Thu|Đông Xuân|đạo ôn|xoài/i

// Commodity name maps, not tea copy: national market rows still carry Rice
// (Comtrade HS 1006) and Wheat, and must keep their Vietnamese names.
const ALLOWED: Record<string, string> = {
  "src/lib/translations.ts: 'Gạo': 'Rice',": 'Comtrade Rice rows: bulletin title and commodity tab name',
  "src/app/manager/dashboard/page.tsx: 'Rice':                     'Lúa gạo',": 'Comtrade Rice rows on the dashboard price list',
  "src/app/manager/dashboard/page.tsx: 'Wheat':                    'Lúa mì',": 'wheat, not rice: "lúa mì" is its Vietnamese name',
}

function isTestFile(relPath: string): boolean {
  return relPath.split('/').includes('__tests__') || /\.(test|spec)\.tsx?$/.test(relPath)
}

function scannedFiles(): string[] {
  const srcFiles = (fs.readdirSync(path.join(WEB_ROOT, 'src'), { recursive: true }) as string[])
    .map((file) => `src/${file.split(path.sep).join('/')}`)
    .filter((file) => /\.tsx?$/.test(file) && !isTestFile(file))
  return [...srcFiles, 'prisma/seed.ts']
}

function riceLines(relPath: string): string[] {
  // NFC first, so a decomposed "lúa" in a source file is still caught.
  const lines = fs.readFileSync(path.join(WEB_ROOT, relPath), 'utf8').normalize('NFC').split('\n')
  return lines.flatMap((line) => (RICE_WORDS.test(line) ? [`${relPath}: ${line.trim()}`] : []))
}

describe('tea cooperative copy', () => {
  it('scans the web source and the seed', () => {
    const files = scannedFiles()
    expect(files).toContain('prisma/seed.ts')
    expect(files).toContain('src/app/farmer/layout.tsx')
    expect(files.some(isTestFile)).toBe(false)
  })

  it('has no rice words in non-test web source or the seed', () => {
    expect(scannedFiles().flatMap(riceLines).filter((hit) => !(hit in ALLOWED))).toEqual([])
  })

  it('keeps every allowlist entry in use', () => {
    const hits = new Set(scannedFiles().flatMap(riceLines))
    expect(Object.keys(ALLOWED).filter((entry) => !hits.has(entry))).toEqual([])
  })
})
