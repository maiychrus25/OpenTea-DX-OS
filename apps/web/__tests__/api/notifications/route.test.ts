// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GET } from '@/app/api/notifications/route'

jest.mock('@/auth', () => ({
  auth: jest.fn().mockResolvedValue(null)
}))

jest.mock('next/server', () => {
  return {
    NextResponse: {
      json: jest.fn((body: any, init?: any) => ({
        status: init?.status || 200,
        json: async () => body,
      })),
    },
  }
})

describe('Notifications API', () => {
  it('TC-7.11-07: GET /api/notifications returns 401 without auth', async () => {
    const req = new Request('http://localhost/api/notifications')
    const res = await GET(req, {})
    
    expect(res.status).toBe(401)
  })

  it('TC-7.11-09: PUT /api/notifications returns 400 with invalid input', async () => {
    const { auth } = require('@/auth')
    jest.mocked(auth).mockResolvedValueOnce({ user: { id: 'user1' } })

    const req = new Request('http://localhost/api/notifications', {
      method: 'PUT',
      body: JSON.stringify({ id: 123 }) // invalid type, should be string
    })
    
    const { PUT } = require('@/app/api/notifications/route')
    const res = await PUT(req, {})
    
    expect(res.status).toBe(400)
  })
})
