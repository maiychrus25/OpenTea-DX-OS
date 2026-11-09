// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextRequest } from 'next/server'

jest.mock('next/server', () => {
  return {
    NextRequest: jest.fn(),
    NextResponse: {
      json: jest.fn((body, init) => {
        return {
          status: init?.status || 200,
          json: async () => body
        }
      })
    }
  }
})
import { PUT } from '@/app/api/profile/route'
import { auth } from '@/auth'
import { UpdateHtxProfileUseCase } from '@/application/useCases/UpdateHtxProfileUseCase'

jest.mock('@/auth', () => ({
  auth: jest.fn()
}))
jest.mock('@/application/useCases/UpdateHtxProfileUseCase')
jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository')
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: { htxProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'htx-md2', name: 'HTX MD2' }) } }
}))

describe('/api/profile API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // TC-1.6-03a: OFFICER session → PUT /api/profile → 403 Forbidden
  it('rejects PUT requests from non-MANAGER roles with 403 Forbidden', async () => {
    ;(auth as jest.Mock).mockResolvedValue({
      user: { id: 'user-1', role: 'officer', htxCode: 'MD2' }
    })

    const request = {
      method: 'PUT',
      json: async () => ({ name: 'HTX MD2' })
    } as any /* mock cast */ as NextRequest

    const response = await PUT(request, { params: {} } as any /* mock context */)
    expect(response.status).toBe(403)
    
    const json = await response.json()
    expect(json.error).toBe('Forbidden')
  })

  // TC-1.6-03b: MANAGER + payload invalid → 400 Bad Request
  it('rejects PUT requests with invalid payload with 400 Bad Request', async () => {
    ;(auth as jest.Mock).mockResolvedValue({
      user: { id: 'manager-1', role: 'manager', htxCode: 'MD2' }
    })

    const request = {
      method: 'PUT',
      json: async () => ({
        name: '', // Invalid: empty string
        address: '123 Test',
        crop_types: []
      })
    } as any /* mock cast */ as NextRequest

    const response = await PUT(request, { params: {} } as any /* mock context */)
    expect(response.status).toBe(400)
    
    const json = await response.json()
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  // TC-1.6-03c: MANAGER + payload valid → 200 OK + use case executed
  it('accepts valid PUT requests from MANAGER and returns 200 OK', async () => {
    ;(auth as jest.Mock).mockResolvedValue({
      user: { id: 'manager-1', role: 'manager', htxCode: 'MD2' }
    })

    const mockUpdatedProfile = { id: 'profile-1', name: 'HTX MD2' }
    const executeMock = jest.fn().mockResolvedValue(mockUpdatedProfile)
    ;(UpdateHtxProfileUseCase as jest.Mock).mockImplementation(() => ({
      execute: executeMock
    }))

    const validPayload = {
      name: 'HTX MD2',
      address: '123 Test',
      crop_types: ['Lúa'],
      contact_phone: '0901234567'
    }

    const request = {
      method: 'PUT',
      json: async () => validPayload
    } as any /* mock cast */ as NextRequest

    const response = await PUT(request, { params: {} } as any /* mock context */)
    expect(response.status).toBe(200)
    
    const json = await response.json()
    expect(json.data).toEqual(mockUpdatedProfile)
    expect(executeMock).toHaveBeenCalledWith('MD2', validPayload)
  })
})
