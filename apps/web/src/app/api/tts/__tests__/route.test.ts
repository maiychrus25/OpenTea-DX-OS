/** @jest-environment node */
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { POST } from '../route'
import { GET as statusGET } from '../status/route'
import { auth } from '@/auth'
import { PiperTtsAdapter } from '@/infrastructure/tts/PiperTtsAdapter'

// Mock dependencies
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/infrastructure/tts/PiperTtsAdapter', () => {
  return {
    PiperTtsAdapter: jest.fn().mockImplementation(() => {
      return {
        synthesize: jest.fn().mockResolvedValue({}),
        checkHealth: jest.fn().mockResolvedValue(true),
      }
    }),
  }
})

const mockCache = { get: jest.fn(), put: jest.fn() }
jest.mock('@/infrastructure/tts/tts-cache', () => ({ TtsCache: jest.fn().mockImplementation(() => mockCache) }))
jest.mock('@/infrastructure/storage/minio-document.adapter', () => ({ MinioDocumentAdapter: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }))

jest.mock('next/server', () => {
  return {
    NextResponse: class MockNextResponse {
      status: number
      body: any
      headers: any
      constructor(body: any, init?: any) {
        this.body = body
        this.status = init?.status || 200
        this.headers = init?.headers || {}
      }
      static json(body: any, init?: any) {
        return {
          status: init?.status || 200,
          headers: init?.headers || {},
          json: async () => body,
        }
      }
    }
  }
})

describe('TTS API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCache.get.mockResolvedValue(null)
    mockCache.put.mockResolvedValue(undefined)
    ;(auth as jest.Mock).mockResolvedValue({
      // A fresh person each test, so the per-process limiter of one test never leaks into the next.
      user: { id: `user-${Math.random()}`, role: 'manager' },
    })
  })

  describe('POST /api/tts', () => {
    const createPostRequest = (body: any) => {
      return {
        json: async () => body,
      } as unknown as Request
    }

    it('returns 401 if unauthorized', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)
      const req = createPostRequest({ text: 'Xin chào' })
      const res = await POST(req, {}) as any
      expect(res.status).toBe(401)
    })

    it('returns 400 if validation fails (empty text)', async () => {
      const req = createPostRequest({ text: '' })
      const res = await POST(req, {}) as any
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 if validation fails (too long)', async () => {
      const longText = 'a'.repeat(2001)
      const req = createPostRequest({ text: longText })
      const res = await POST(req, {}) as any
      expect(res.status).toBe(400)
    })

    it('returns 200 and audio stream for valid text', async () => {
      const req = createPostRequest({ text: 'Xin chào' })
      const res = await POST(req, {}) as any
      expect(res.status).toBe(200)
      expect(res.headers['Content-Type']).toBe('audio/wav')
    })

    it('returns 503 if piper is unavailable', async () => {
      // Mock adapter to throw SERVICE_UNAVAILABLE
      ;(PiperTtsAdapter as jest.Mock).mockImplementationOnce(() => ({
        synthesize: jest.fn().mockRejectedValue(new Error('SERVICE_UNAVAILABLE')),
      }))
      const req = createPostRequest({ text: 'Xin chào' })
      const res = await POST(req, {}) as any
      expect(res.status).toBe(503)
      const json = await res.json()
      expect(json.error.code).toBe('SERVICE_UNAVAILABLE')
    })
  })

  describe('limit and cache', () => {
    const post = (text = 'Xin chào') => POST({ json: async () => ({ text }) } as unknown as Request, {}) as Promise<any>

    it('answers 429 RATE_LIMITED on the 21st request of one person in a minute, and not for another person', async () => {
      const user = { id: 'heavy-listener', role: 'farmer' }
      ;(auth as jest.Mock).mockResolvedValue({ user })
      for (let i = 0; i < 20; i++) expect((await post()).status).toBe(200)
      const blocked = await post()
      expect(blocked.status).toBe(429)
      expect((await blocked.json()).error.code).toBe('RATE_LIMITED')
      expect(blocked.headers['Retry-After']).toBe('60')
      ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'someone-else', role: 'farmer' } })
      expect((await post()).status).toBe(200)
    })

    it('serves a cached sentence without calling Piper', async () => {
      mockCache.get.mockResolvedValue(Buffer.from('RIFFcached'))
      const res = await post()
      expect(res.status).toBe(200)
      expect(res.headers['Content-Type']).toBe('audio/wav')
      expect(PiperTtsAdapter).not.toHaveBeenCalled()
      expect(mockCache.get).toHaveBeenCalledWith(expect.any(String), 'Xin chào')
    })

    it('synthesizes on a miss and stores the audio', async () => {
      const res = await post('Chào bà con')
      expect(res.status).toBe(200)
      expect(PiperTtsAdapter).toHaveBeenCalledTimes(1)
      expect(mockCache.put).toHaveBeenCalledWith(expect.any(String), 'Chào bà con', expect.any(Buffer))
    })

    it('still speaks when the cache is down', async () => {
      mockCache.get.mockRejectedValue(new Error('minio down'))
      mockCache.put.mockRejectedValue(new Error('minio down'))
      expect((await post()).status).toBe(200)
    })

    it('does not cache a failed synthesis', async () => {
      ;(PiperTtsAdapter as jest.Mock).mockImplementationOnce(() => ({ synthesize: jest.fn().mockRejectedValue(new Error('SERVICE_UNAVAILABLE')) }))
      expect((await post()).status).toBe(503)
      expect(mockCache.put).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/tts/status', () => {
    it('returns 200 and available status', async () => {
      const res = await statusGET() as any
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.available).toBe(true)
    })
    
    it('returns available: false if adapter check fails', async () => {
      ;(PiperTtsAdapter as jest.Mock).mockImplementationOnce(() => ({
        checkHealth: jest.fn().mockResolvedValue(false),
      }))
      const res = await statusGET() as any
      const json = await res.json()
      expect(json.available).toBe(false)
    })
  })
})
