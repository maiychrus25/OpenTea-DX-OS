/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import fs from 'fs'
import path from 'path'
import { extractPdfText, readPdfText, pdfSidecarKey } from '@/infrastructure/storage/pdf-text'

jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }))

// unpdf loads its PDF.js bundle with a dynamic import that Jest's VM refuses without --experimental-vm-modules,
// so this file stands in for it: the text between (...) Tj of the uncompressed fixtures. The real library runs in pdf-text.real.test.ts.
jest.mock('unpdf', () => ({
  getDocumentProxy: async (bytes: Uint8Array) => {
    if (!Buffer.from(bytes).toString('latin1').startsWith('%PDF')) throw new Error('Invalid PDF structure')
    return bytes
  },
  extractText: async (bytes: Uint8Array) => ({
    text: Array.from(Buffer.from(bytes).toString('latin1').matchAll(/\(([^)]*)\) Tj/g), (m) => m[1]).join(' '),
  }),
}))

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '../../fixtures/pdf', name))

function storage(over: Record<string, jest.Mock> = {}) {
  return {
    getDocumentContent: jest.fn(async () => ''),
    downloadDocument: jest.fn(async () => fixture('text.pdf')),
    uploadDocument: jest.fn(async () => undefined),
    ...over,
  }
}

describe('extractPdfText', () => {
  it('reads the text layer of a text PDF', async () => {
    expect(await extractPdfText(fixture('text.pdf'))).toContain('cach ly')
  })

  it('answers null for a scanned PDF with no text layer', async () => {
    expect(await extractPdfText(fixture('scanned.pdf'))).toBeNull()
  })

  it('answers null for bytes that are not a PDF', async () => {
    expect(await extractPdfText(Buffer.from('not a pdf at all'))).toBeNull()
  })
})

describe('readPdfText', () => {
  it('puts the sidecar next to the original and returns the text', async () => {
    const s = storage()
    const text = await readPdfText(s, 'para/TC/Resources/a.pdf', false)
    expect(text).toContain('cach ly')
    expect(pdfSidecarKey('para/TC/Resources/a.pdf')).toBe('para/TC/Resources/a.pdf.txt')
    expect(s.uploadDocument).toHaveBeenCalledWith('para/TC/Resources/a.pdf.txt', expect.stringContaining('cach ly'), 'text/plain')
  })

  it('reads an existing sidecar and does not download the PDF again', async () => {
    const s = storage({ getDocumentContent: jest.fn(async () => 'da trich') })
    expect(await readPdfText(s, 'para/TC/Resources/a.pdf', true)).toBe('da trich')
    expect(s.downloadDocument).not.toHaveBeenCalled()
    expect(s.uploadDocument).not.toHaveBeenCalled()
  })

  it('records a scanned PDF as unreadable with an empty sidecar, and later reads stay null', async () => {
    const s = storage({ downloadDocument: jest.fn(async () => fixture('scanned.pdf')) })
    expect(await readPdfText(s, 'para/TC/Resources/s.pdf', false)).toBeNull()
    expect(s.uploadDocument).toHaveBeenCalledWith('para/TC/Resources/s.pdf.txt', '', 'text/plain')
    const again = storage({ getDocumentContent: jest.fn(async () => '') })
    expect(await readPdfText(again, 'para/TC/Resources/s.pdf', true)).toBeNull()
    expect(again.downloadDocument).not.toHaveBeenCalled()
  })

  it('still returns the text when the sidecar cannot be written', async () => {
    const s = storage({ uploadDocument: jest.fn(async () => { throw new Error('denied') }) })
    expect(await readPdfText(s, 'para/TC/Resources/a.pdf', false)).toContain('cach ly')
  })
})
