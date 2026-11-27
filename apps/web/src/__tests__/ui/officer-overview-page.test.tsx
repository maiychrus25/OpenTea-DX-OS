// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import OfficerDashboard from '@/app/officer/dashboard/page'
import { loadOverview } from '@/app/officer/dashboard/overview-query'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/app/officer/dashboard/overview-query', () => ({ loadOverview: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn(() => { throw new Error('redirect') }), useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/features/farmer-web/WeatherHero', () => ({ WeatherHero: ({ title, subtitle, actions, forecastHref }: { title: string; subtitle: string; actions: { href: string; label: string }[]; forecastHref: string }) => <header><h1>{title}</h1><p>{subtitle}</p>{actions.map(action => <a href={action.href} key={action.label}>{action.label}</a>)}<a href={forecastHref}>Xem dự báo</a></header> }))
const now = new Date('2026-11-27T09:00:00Z')
const empty = () => ({ total: 0, page: 1, pageCount: 1, entries: [], pendingEntries: [], households: [], diseases: [], pendingDiseases: [], cycles: [], activities: [], monthlyEntries: [], approvedEntries: [], htx: { name: 'HTX chè', address: 'Vùng chè' } })
beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(now)
  ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'officer', name: 'Cán bộ' } })
  ;(requireTenant as jest.Mock).mockResolvedValue({ htxProfileId: 'tenant-a' })
  ;(loadOverview as jest.Mock).mockResolvedValue(empty())
})
afterEach(() => jest.useRealTimers())

describe('officer dashboard blocks', () => {
  it('keeps four real zero metrics and table, hides empty urgency and approval metrics, shows no sample blocks', async () => {
    render(await OfficerDashboard({}))
    expect(screen.getByTestId('officer-metric-grid').querySelectorAll('[data-testid="metric-card"]')).toHaveLength(4)
    expect(screen.getAllByTestId('metric-card').map(card => card.querySelector('strong')?.textContent)).toEqual(['0', '0', '0', '0'])
    expect(screen.getByTestId('task-table')).toHaveTextContent('Chưa có nhật ký nào')
    expect(screen.queryByText(/Cần xử lý ngay/)).not.toBeInTheDocument()
    expect(screen.queryByText('Tỉ lệ duyệt đúng hạn')).not.toBeInTheDocument()
    expect(screen.queryByText('Mẫu')).not.toBeInTheDocument()
    expect(screen.queryByText('Gian hàng & Tour')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tạo nhật ký' })).toHaveAttribute('href', '/officer/journal?create=1')
    expect(screen.getByRole('link', { name: 'Xem dự báo' })).toHaveAttribute('href', '/officer/bulletin?category=weather')
  })
  it('compares planned harvest against the latest safe date, including equality, and renders real progress', async () => {
    const parcel = { id: 'parcel-a', parcel_code: 'P-TC-001', status: 'TENDING', area_ha: 1.4, created_at: now, journal_entries: [{ id: 'j' }], disease_reports: [] }
    const household = { id: 'household-a', name: 'Hộ chè', created_at: now, parcels: [parcel, { ...parcel, id: 'parcel-b', parcel_code: 'P-TC-002', journal_entries: [] }] }
    const cycle = { parcel_id: 'parcel-a', parcel: { parcel_code: 'P-TC-001', household: { name: 'Hộ chè' } } }
    ;(loadOverview as jest.Mock).mockResolvedValue({ ...empty(), households: [household],
      cycles: [
        { ...cycle, id: 'unsafe', estimated_harvest_date: new Date('2026-11-28') },
        { ...cycle, id: 'safe', estimated_harvest_date: new Date('2026-11-30') },
        { ...cycle, id: 'later', estimated_harvest_date: new Date('2026-12-20') },
      ],
      activities: [{ safe_harvest_date: new Date('2026-11-30'), journal_entry: { parcel_id: 'parcel-a' } }],
      pendingDiseases: [{ id: 'disease-a', ai_disease_name: 'Bọ xít muỗi', detection_date: now, parcel: { parcel_code: 'P-TC-002' }, household: { name: 'Hộ chè' } }],
      approvedEntries: [{ created_at: new Date('2026-11-26T09:00:00Z'), approved_at: now }],
    })
    render(await OfficerDashboard({ searchParams: { page: '2' } }))
    expect(loadOverview).toHaveBeenCalledWith('tenant-a', now, 2)
    expect(screen.getByRole('heading', { name: 'Cần xử lý ngay · 2' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xác nhận ca bệnh' })).toHaveAttribute('href', '/officer/diseases/disease-a')
    const schedule = screen.getByRole('region', { name: 'Lịch hái 7 ngày tới' })
    expect(within(schedule).getByText('Còn cách ly')).toBeInTheDocument()
    expect(within(schedule).getByText('Được hái')).toBeInTheDocument()
    expect(within(schedule).queryByText('20/12')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Tiến độ Hộ chè' })).toHaveAttribute('value', '50')
    expect(screen.getByText('Tỉ lệ duyệt đúng hạn').parentElement).toHaveAttribute('title', expect.stringContaining('48 giờ'))
    expect(screen.getByText('Trạng thái từng thửa chè')).toBeInTheDocument()
  })
  it('does not query tenant data for another role', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'farmer' } })
    await expect(OfficerDashboard({})).rejects.toThrow('redirect')
    expect(requireTenant).not.toHaveBeenCalled()
    expect(loadOverview).not.toHaveBeenCalled()
  })
})
