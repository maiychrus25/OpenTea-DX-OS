/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// The real unpdf on the fixture PDFs. Jest's VM needs a flag for the library's dynamic import, so it runs only with:
//   NODE_OPTIONS=--experimental-vm-modules npx jest src/__tests__/infrastructure/storage/pdf-text.real.test.ts

import fs from 'fs'
import path from 'path'
import { extractPdfText } from '@/infrastructure/storage/pdf-text'

const maybe = /experimental-vm-modules/.test(process.env.NODE_OPTIONS ?? '') ? describe : describe.skip
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '../../fixtures/pdf', name))

maybe('extractPdfText with the real unpdf', () => {
  it('reads a text PDF', async () => {
    expect(await extractPdfText(fixture('text.pdf'))).toContain('Sau khi phun thuoc Sagi')
  })

  it('answers null for a scanned PDF', async () => {
    expect(await extractPdfText(fixture('scanned.pdf'))).toBeNull()
  })

  it('answers null for bytes that are not a PDF', async () => {
    expect(await extractPdfText(Buffer.from('not a pdf at all'))).toBeNull()
  })
})
