// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GET } from '../route'
import { auth } from '@/auth'

// Mock dependencies
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/infrastructure/geocoding/NominatimAdapter', () => {
  return {
    NominatimGeocodingAdapter: jest.fn().mockImplementation(() => {
      return {
        search: jest.fn().mockResolvedValue([
          { display_name: 'Hanoi', lat: '21.0', lon: '105.8' }
        ]),
      }
    }),
  }
})

describe('GET /api/geocode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock successful auth by default
    ;(auth as jest.Mock).mockResolvedValue({
      user: { id: '1', role: 'manager' },
    })
  })

  const createRequest = (url: string, ip?: string) => {
    return new Request(url, {
      headers: new Headers(ip ? { 'x-forwarded-for': ip } : {}),
    })
  }

  it('returns 401 if unauthorized', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    const req = createRequest('http://localhost/api/geocode?q=Hanoi')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 if validation fails', async () => {
    const req = createRequest('http://localhost/api/geocode?q=a') // min 2 chars
    const res = await GET(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 200 and geocoding results for valid query', async () => {
    const req = createRequest('http://localhost/api/geocode?q=Hanoi', '1.1.1.1')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toBeDefined()
    expect(json.results[0].display_name).toBe('Hanoi')
  })

  it('applies rate limiting (429) for same IP', async () => {
    const ip = '2.2.2.2'
    const req1 = createRequest('http://localhost/api/geocode?q=Hanoi', ip)
    const req2 = createRequest('http://localhost/api/geocode?q=HCMC', ip)
    
    // First request should pass
    const res1 = await GET(req1)
    expect(res1.status).toBe(200)
    
    // Immediate second request from same IP should fail
    const res2 = await GET(req2)
    expect(res2.status).toBe(429)
    const json = await res2.json()
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED')
  })
})
