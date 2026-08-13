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
        synthesize: jest.fn().mockResolvedValue(new ReadableStream()),
        checkHealth: jest.fn().mockResolvedValue(true),
      }
    }),
  }
})

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
          json: async () => body,
        }
      }
    }
  }
})

describe('TTS API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue({
      user: { id: '1', role: 'manager' },
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
      const longText = 'a'.repeat(501)
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
