/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHash } from 'crypto'
import { TtsCache, ttsCacheKey, TTS_CACHE_TTL_MS } from '@/infrastructure/tts/tts-cache'

const NOW = Date.parse('2026-11-28T10:00:00Z')

function store(entries: Record<string, { at: number; bytes: Buffer }> = {}) {
  return {
    listDocuments: jest.fn(async (prefix: string) =>
      Object.entries(entries).filter(([k]) => k.startsWith(prefix)).map(([key, e]) => ({ name: key.slice(prefix.length), size: e.bytes.length, uploadDate: new Date(e.at), key, isDir: false }))),
    downloadDocument: jest.fn(async (key: string) => entries[key].bytes),
    uploadDocument: jest.fn(async () => undefined),
  }
}

describe('ttsCacheKey', () => {
  it('is the sha256 of voice and text under para/_tts-cache/', () => {
    const hash = createHash('sha256').update('viXin chào').digest('hex')
    expect(ttsCacheKey('vi', 'Xin chào')).toBe(`para/_tts-cache/${hash}.wav`)
    expect(ttsCacheKey('en', 'Xin chào')).not.toBe(ttsCacheKey('vi', 'Xin chào'))
  })
})

describe('TtsCache', () => {
  const key = ttsCacheKey('vi', 'Xin chào')

  it('misses when nothing is stored, and lists by the hash so the object lookup is one call', async () => {
    const s = store()
    expect(await new TtsCache(s, () => NOW).get('vi', 'Xin chào')).toBeNull()
    expect(s.listDocuments).toHaveBeenCalledWith(key.replace(/\.wav$/, ''))
    expect(s.downloadDocument).not.toHaveBeenCalled()
  })

  it('hits on an entry younger than 7 days', async () => {
    const bytes = Buffer.from('RIFFaudio')
    const s = store({ [key]: { at: NOW - TTS_CACHE_TTL_MS + 1000, bytes } })
    expect(await new TtsCache(s, () => NOW).get('vi', 'Xin chào')).toEqual(bytes)
  })

  it('misses on an entry 7 days old or older', async () => {
    const s = store({ [key]: { at: NOW - TTS_CACHE_TTL_MS, bytes: Buffer.from('old') } })
    expect(await new TtsCache(s, () => NOW).get('vi', 'Xin chào')).toBeNull()
  })

  it('stores audio as audio/wav under the key', async () => {
    const s = store()
    const bytes = Buffer.from('RIFFaudio')
    await new TtsCache(s, () => NOW).put('vi', 'Xin chào', bytes)
    expect(s.uploadDocument).toHaveBeenCalledWith(key, bytes, 'audio/wav')
  })
})
