// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { NotFoundError } from '@/domain/errors'

import { prisma } from '@/infrastructure/db/prisma.client'

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
  requireTenant: jest.fn().mockResolvedValue({ userId: 'u1', role: 'manager', htxCode: 'TC', htxProfileId: 'dummy' }),
}))

// Mock Prisma
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    parcel: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { area_ha: 10 } }),
      findMany: jest.fn().mockResolvedValue([{ area_ha: 5, estimated_yield_per_ha: 2000 }]),
      groupBy: jest.fn().mockResolvedValue([{ status: 'TENDING', _count: { _all: 2 } }]),
    },
    household: {
      count: jest.fn().mockResolvedValue(2),
    },
    lot: {
      count: jest.fn().mockResolvedValue(5),
    },
    journalEntry: {
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([]),
    },
    marketData: {
      findMany: jest.fn().mockResolvedValue([
        { commodity: 'Tea', metric: 'producer_price_index', value: 105.5, unit: 'Index', source: 'Test' }
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

  type MarketRow = { commodity: string; metric: string; value: number; unit: string; source: string; fetched_at: Date }
  // A tiny stand-in for market_data: honours where.commodity (equals or { not }), newest first, and take.
  function serveMarket(rows: MarketRow[]) {
    ;(prisma.marketData.findMany as jest.Mock).mockImplementation(async ({ where, take }) =>
      rows
        .filter((r) => {
          const c = where?.commodity
          if (c === undefined) return true
          return typeof c === 'string' ? r.commodity === c : r.commodity !== c.not
        })
        .sort((a, b) => b.fetched_at.getTime() - a.fetched_at.getTime())
        .slice(0, take),
    )
  }
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 10, 6, minute))
  const row = (commodity: string, minute: number, source = 'COMTRADE'): MarketRow =>
    ({ commodity, metric: `metric_${minute}`, value: 100 + minute, unit: 'tonnes', source, fetched_at: at(minute) })
  const shownCommodities = () => screen.getAllByText(/^(Chè|Lúa gạo|Cà phê)$/).map((el) => el.textContent)

  it('shows no "giá mô phỏng" label', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({ user: { role: 'manager' } })
    serveMarket([
      { commodity: 'Tea', metric: 'export_value_to_world', value: 250, unit: 'million_USD', source: 'COMTRADE', fetched_at: at(2) },
    ])

    render(await ManagerDashboard())

    expect(screen.queryByText(/giá mô phỏng|Nguồn mô phỏng/)).not.toBeInTheDocument()
  })

  it('shows tea prices even when rice rows are newer', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({ user: { role: 'manager' } })
    serveMarket([row('Tea', 1), row('Tea', 2), row('Tea', 3), row('Rice', 10), row('Rice', 11), row('Coffee', 12)])

    render(await ManagerDashboard())

    expect(shownCommodities()).toEqual(['Chè', 'Chè', 'Chè'])
  })

  it('shows only tea rows and the empty state when there is none', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({ user: { role: 'manager' } })
    serveMarket([row('Rice', 10), row('Coffee', 12)])

    render(await ManagerDashboard())

    expect(screen.getByText('Chưa có dữ liệu giá.')).toBeInTheDocument()
    expect(screen.queryByText(/^(Lúa gạo|Cà phê)$/)).not.toBeInTheDocument()
  })

  it('counts distinct sources, not price rows', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({ user: { role: 'manager' } })
    serveMarket([row('Tea', 1), row('Tea', 2), row('Tea', 3)])

    render(await ManagerDashboard())

    expect(screen.getByText('1 nguồn đã kiểm chứng')).toBeInTheDocument()
    expect(screen.getByText('COMTRADE')).toBeInTheDocument()
  })

  it('names no source when there is no market data', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({ user: { role: 'manager' } })
    serveMarket([])

    render(await ManagerDashboard())

    expect(screen.getByText('Chưa có dữ liệu giá.')).toBeInTheDocument()
    expect(screen.queryByText(/nguồn đã kiểm chứng/)).not.toBeInTheDocument()
    expect(screen.queryByText(/USDA|WTO|Sở NN&PTNT/)).not.toBeInTheDocument()
  })
})
