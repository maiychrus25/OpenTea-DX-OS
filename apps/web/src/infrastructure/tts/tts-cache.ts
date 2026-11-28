// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHash } from 'crypto'

export const TTS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const CACHE_ROOT = 'para/_tts-cache/'

export interface TtsCacheStorage {
  listDocuments(prefix: string): Promise<{ uploadDate: Date }[]>
  downloadDocument(key: string): Promise<Buffer>
  uploadDocument(key: string, content: Buffer, mimeType?: string): Promise<void>
}

/** `para/_tts-cache/<sha256(voice + text)>.wav` */
export function ttsCacheKey(voice: string, text: string): string {
  return `${CACHE_ROOT}${createHash('sha256').update(voice + text).digest('hex')}.wav`
}

/**
 * Spoken audio kept in the object store for 7 days, so the same sentence is synthesized once.
 * shortcut: an expired entry is replaced the next time it is asked for and never purged, add a 7-day lifecycle rule on para/_tts-cache/ if the folder grows.
 */
export class TtsCache {
  constructor(private readonly storage: TtsCacheStorage, private readonly now: () => number = Date.now) {}

  async get(voice: string, text: string): Promise<Buffer | null> {
    const key = ttsCacheKey(voice, text)
    // Listing by the hash without the extension: the adapter hides an entry whose name is empty.
    const [entry] = await this.storage.listDocuments(key.replace(/\.wav$/, ''))
    if (!entry || this.now() - entry.uploadDate.getTime() >= TTS_CACHE_TTL_MS) return null
    return this.storage.downloadDocument(key)
  }

  async put(voice: string, text: string, audio: Buffer): Promise<void> {
    await this.storage.uploadDocument(ttsCacheKey(voice, text), audio, 'audio/wav')
  }
}
