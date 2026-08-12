import { PUT, GET } from '@/app/api/profile/route'
import { auth } from '@/auth'
import { UpdateHtxProfileUseCase } from '@/application/useCases/UpdateHtxProfileUseCase'
import { NextResponse } from 'next/server'

jest.mock('next/server', () => {
  return {
    NextResponse: {
      json: jest.fn().mockImplementation((data, init) => {
        return {
          status: init?.status || 200,
          json: async () => data
        }
      })
    },
    NextRequest: class NextRequest {
      public url: string
      public options: any
      constructor(url: string, options: any = {}) {
        this.url = url
        this.options = options
      }
      async json() {
        return JSON.parse(this.options.body)
      }
    }
  }
})

jest.mock('@/auth', () => ({
  auth: jest.fn()
}))
jest.mock('@/application/useCases/UpdateHtxProfileUseCase')
jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository')
jest.mock('@/application/useCases/GetHtxProfileUseCase')

describe('GET /api/profile', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)

    const request = new Request('http://localhost/api/profile')
    const response = await GET(request, { params: {} }) as NextResponse
    expect(response.status).toBe(401)
  })

  it('returns 200 if authenticated', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'officer' } })
    const { GetHtxProfileUseCase } = require('@/application/useCases/GetHtxProfileUseCase')
    ;(GetHtxProfileUseCase as jest.Mock).mockImplementation(() => ({
      execute: jest.fn().mockResolvedValue({ id: '1', name: 'HTX Test' })
    }))

    const request = new Request('http://localhost/api/profile')
    const response = await GET(request, { params: {} }) as NextResponse
    expect(response.status).toBe(200)
  })
})

describe('PUT /api/profile', () => {
  const mockExecute = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(UpdateHtxProfileUseCase as jest.Mock).mockImplementation(() => ({
      execute: mockExecute
    }))
  })

  it('returns 403 Forbidden if user is not manager', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'officer' } })

    const request = new Request('http://localhost/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ name: 'HTX' })
    })

    const response = await PUT(request, { params: {} }) as NextResponse
    expect(response.status).toBe(403)
  })

  it('returns 400 Bad Request on invalid payload', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'manager' } })

    const request = new Request('http://localhost/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ name: '' }) // Invalid: name empty
    })

    const response = await PUT(request, { params: {} }) as NextResponse
    expect(response.status).toBe(400)
  })

  it('returns 200 OK and calls use case on valid payload', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'manager' } })
    mockExecute.mockResolvedValue({ id: '1', name: 'HTX Updated' })

    const validData = {
      name: 'HTX Updated',
      address: 'New Address',
      contact_email: 'test@example.com',
      contact_phone: '123456',
      crop_types: [],
    }

    const request = new Request('http://localhost/api/profile', {
      method: 'PUT',
      body: JSON.stringify(validData)
    })

    const response = await PUT(request, { params: {} }) as NextResponse
    expect(response.status).toBe(200)
    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ name: 'HTX Updated' }))
  })
})
