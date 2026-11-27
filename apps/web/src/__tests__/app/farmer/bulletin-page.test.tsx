// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen } from '@testing-library/react'
import FarmerBulletinPage from '@/app/farmer/bulletin/page'

const getAllLatestBulletins = jest.fn()

jest.mock('@/auth', () => ({ auth: jest.fn().mockResolvedValue({ user: { htxCode: 'TC' } }) }))
jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: {} }))
jest.mock('@/infrastructure/db/repositories/PrismaBulletinRepository', () => ({
  PrismaBulletinRepository: jest.fn().mockImplementation(() => ({ getAllLatestBulletins })),
}))
jest.mock('@/components/features/bulletin/BulletinView', () => ({
  BulletinView: ({ bulletin }: { bulletin: { commodity: string } }) => <article>{bulletin.commodity}</article>,
}))

describe('farmer bulletin page', () => {
  it('farmer bulletin list shows the empty state when there is no bulletin', async () => {
    getAllLatestBulletins.mockResolvedValue([])
    render(await FarmerBulletinPage())
    expect(screen.getByText('Chưa có bản tin nào')).toBeInTheDocument()
    expect(screen.queryByText('Mẫu')).not.toBeInTheDocument()
    expect(screen.queryByText('Giá chè hôm nay')).not.toBeInTheDocument()
    expect(screen.queryByText('Đọc nhiều nhất')).not.toBeInTheDocument()
  })

  it('shows only the stored bulletins', async () => {
    getAllLatestBulletins.mockResolvedValue([{ id: 'b1', commodity: 'tea' }])
    render(await FarmerBulletinPage())
    expect(screen.getByText('tea')).toBeInTheDocument()
    expect(screen.queryByText('Chưa có bản tin nào')).not.toBeInTheDocument()
  })
})
