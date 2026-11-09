// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { NotFoundError } from '@/domain/errors'

import ManagerDashboard from '../page'

// Mock auth
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  redirect: jest.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

// Mock tenant resolution
jest.mock('@/lib/api/tenant', () => ({
  requireTenant: jest.fn().mockResolvedValue({ userId: 'u1', role: 'manager', htxCode: 'MD2', htxProfileId: 'dummy' }),
}))

// Mock Prisma
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    parcel: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { area_ha: 10 } }),
      findMany: jest.fn().mockResolvedValue([{ area_ha: 5, estimated_yield_per_ha: 2000 }]),
    },
    lot: {
      count: jest.fn().mockResolvedValue(5),
    },
    journalEntry: {
      count: jest.fn().mockResolvedValue(3),
    },
    marketData: {
      findMany: jest.fn().mockResolvedValue([
        { commodity: 'Lúa', metric: 'producer_price_index', value: 105.5, unit: 'Index', source: 'Test' }
      ]),
    }
  },
}))

// Mock Repository
jest.mock('@/infrastructure/db/repositories/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn(),
}))

// Mock UseCase
jest.mock('@/application/useCases/GetHtxProfileUseCase', () => {
  return {
    GetHtxProfileUseCase: jest.fn().mockImplementation(() => {
      return {
        execute: jest.fn().mockResolvedValue({ id: 'dummy' }),
      }
    }),
  }
})

describe('ManagerDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('redirects to login if no session', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(null)
    await expect(ManagerDashboard()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to login if role is not manager', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({
      user: { role: 'farmer' },
    })
    await expect(ManagerDashboard()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('renders onboarding CTA when profile is not found', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({
      user: { role: 'manager' },
    })
    
    const mockExecute = jest.fn().mockRejectedValueOnce(new NotFoundError('HtxProfile not found'))
    ;(GetHtxProfileUseCase as jest.Mock).mockImplementationOnce(() => ({
      execute: mockExecute,
    }))

    const jsx = await ManagerDashboard()
    render(jsx)

    expect(screen.getByText('Chưa thiết lập Hợp tác xã')).toBeInTheDocument()
    expect(screen.getByText('Thiết lập ngay')).toBeInTheDocument()
  })

  it('does not render onboarding CTA when profile exists', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({
      user: { role: 'manager' },
    })
    
    const mockExecute = jest.fn().mockResolvedValueOnce({ id: 'profile-1' })
    ;(GetHtxProfileUseCase as jest.Mock).mockImplementationOnce(() => ({
      execute: mockExecute,
    }))

    const jsx = await ManagerDashboard()
    render(jsx)

    expect(screen.queryByText('Chưa thiết lập Hợp tác xã')).not.toBeInTheDocument()
    expect(screen.getByText(/Chào buổi/)).toBeInTheDocument()
  })
})
