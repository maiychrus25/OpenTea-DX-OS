// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ManagerDashboard from '../page'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { NotFoundError } from '@/domain/errors'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

// Mock auth
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

// Mock Prisma
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {},
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
        execute: jest.fn(),
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
    await ManagerDashboard()
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to login if role is not manager', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({
      user: { role: 'farmer' },
    })
    await ManagerDashboard()
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
    expect(screen.getByText('Tổng quan — Trưởng HTX')).toBeInTheDocument()
  })
})
