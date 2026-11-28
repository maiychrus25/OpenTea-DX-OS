// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { logger } from '@/lib/logger'

/** A page of scanned images has no text layer; below this many non-space characters we call the file unreadable. */
const MIN_TEXT_CHARS = 20
// shortcut: a PDF over 15 MB is called unreadable, raise it when a real handbook needs more.
const MAX_PDF_BYTES = 15 * 1024 * 1024

export interface PdfTextStorage {
  getDocumentContent(key: string): Promise<string>
  downloadDocument(key: string): Promise<Buffer>
  uploadDocument(key: string, content: Buffer | string, mimeType?: string): Promise<void>
}

/** The extracted text lives next to the original, in the same HTX folder. An empty sidecar means unreadable. */
export const pdfSidecarKey = (pdfKey: string) => `${pdfKey}.txt`

/** The text layer of a PDF, or null for a scan (or a file that is not a readable PDF). Never OCR. */
export async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  if (bytes.length > MAX_PDF_BYTES) return null
  try {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: true })
    return text.replace(/\s/g, '').length >= MIN_TEXT_CHARS ? text.trim() : null
  } catch (error) {
    logger.error('Failed to read PDF text', { error })
    return null
  }
}

/** The sidecar text if the sidecar exists, else extracts, writes the sidecar once and returns the text. Null = unreadable. */
export async function readPdfText(storage: PdfTextStorage, pdfKey: string, sidecarExists: boolean): Promise<string | null> {
  const sidecar = pdfSidecarKey(pdfKey)
  if (sidecarExists) return (await storage.getDocumentContent(sidecar)) || null
  const text = await extractPdfText(await storage.downloadDocument(pdfKey))
  try {
    await storage.uploadDocument(sidecar, text ?? '', 'text/plain')
  } catch (error) {
    logger.error('Failed to store PDF text next to the original', { error, key: sidecar })
  }
  return text
}
