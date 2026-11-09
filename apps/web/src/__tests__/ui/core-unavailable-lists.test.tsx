// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ManagerLotsPage from '@/app/manager/lots/page'
import { HouseholdManager } from '@/app/officer/households/_components/HouseholdManager'
import { ApproveList } from '@/app/manager/journal-approve/_components/ApproveList'
import { JournalList } from '@/app/officer/journal/_components/JournalList'
import { FarmerJournalList } from '@/app/farmer/journal/_components/FarmerJournalList'
import { LotList } from '@/app/officer/lots/_components/LotList'
import { FarmerJournalForm } from '@/app/farmer/journal/_components/FarmerJournalForm'
import { JournalForm } from '@/app/officer/journal/_components/JournalForm'
import { LotCreateForm } from '@/app/officer/lots/_components/LotCreateForm'
import { HouseholdProfile } from '@/app/officer/households/[id]/_components/household-profile'
import OfficerDiseaseDetailPage from '@/app/officer/diseases/[id]/page'
import SoilHealthPageClient from '@/app/officer/households/[id]/soil-health/SoilHealthPageClient'
import { Step1Household } from '@/app/officer/farm-zones/setup/_components/step1-household'
import { OfficerJournalApproval } from '@/app/officer/journal/_components/officer-journal-approval'
import FarmZoneReadOnly from '@/app/manager/farm-zones/_components/FarmZoneReadOnly'
import { redirectToLogin } from '@/lib/api/redirect-to-login'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('@/lib/api/redirect-to-login', () => ({ redirectToLogin: jest.fn() }))
jest.mock('recharts', () => new Proxy({}, { get: () => () => null }))

const LOAD_FAILED = 'Không thể tải dữ liệu. Vui lòng thử lại sau.'
const down = { error: { code: 'CORE_UNAVAILABLE', message: 'Dịch vụ dữ liệu đang tạm gián đoạn.' } }

function answer(status: number, body: unknown) {
  return jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }) as unknown as typeof fetch
}
const noop = () => undefined

const screens: [string, () => React.ReactElement, string, RegExp | null][] = [
  ['ApproveList', () => <ApproveList />, LOAD_FAILED, /Không có nhật ký nào đang chờ duyệt/],
  ['JournalList', () => <JournalList />, LOAD_FAILED, /Chưa có nhật ký nào/],
  ['FarmerJournalList', () => <FarmerJournalList />, LOAD_FAILED, /Bạn chưa ghi nhật ký nào/],
  ['LotList', () => <LotList />, LOAD_FAILED, /Chưa có lô hàng nào/],
  ['FarmerJournalForm', () => <FarmerJournalForm onSuccess={noop} onCancel={noop} />, LOAD_FAILED, null],
  ['JournalForm', () => <JournalForm onSuccess={noop} onCancel={noop} />, LOAD_FAILED, null],
  ['LotCreateForm', () => <LotCreateForm onSuccess={noop} onCancel={noop} />, LOAD_FAILED, null],
  ['ManagerLotsPage', () => <ManagerLotsPage />, 'Không thể tải danh sách lô hàng.', /Không tìm thấy lô hàng nào/],
  ['HouseholdManager', () => <HouseholdManager />, 'Không thể tải danh sách nông hộ. Vui lòng thử lại sau.', /Chưa có nông hộ nào/],
  ['OfficerDiseaseDetailPage', () => <OfficerDiseaseDetailPage params={{ id: 'd1' }} />, 'Lỗi khi tải dữ liệu.', null],
  ['SoilHealthPageClient', () => <SoilHealthPageClient householdId="h1" householdName="Hộ A" />, LOAD_FAILED, /Chưa có thửa đất/],
  ['OfficerJournalApproval', () => <OfficerJournalApproval />, LOAD_FAILED, /Chưa có nhật ký nào cần duyệt/],
  ['FarmZoneReadOnly', () => <FarmZoneReadOnly />, LOAD_FAILED, /Không tìm thấy thửa đất nào/],
]

beforeEach(() => jest.clearAllMocks())

describe.each(screens)('%s', (_name, element, message, emptyState) => {
  test('says the data could not be loaded when the core is down', async () => {
    global.fetch = answer(503, down)
    render(element())
    expect(await screen.findByText(message)).toBeInTheDocument()
    if (emptyState) expect(screen.queryByText(emptyState)).not.toBeInTheDocument()
    expect(redirectToLogin).not.toHaveBeenCalled()
  })

  test('goes to login on a 401', async () => {
    global.fetch = answer(401, { error: { code: 'UNAUTHORIZED', message: 'x' } })
    render(element())
    await waitFor(() => expect(redirectToLogin).toHaveBeenCalled())
  })
})

describe('empty results stay empty', () => {
  test.each([
    ['HouseholdManager', () => <HouseholdManager />, /Chưa có nông hộ nào/],
    ['JournalList', () => <JournalList />, /Chưa có nhật ký nào/],
    ['LotList', () => <LotList />, /Chưa có lô hàng nào/],
    ['ApproveList', () => <ApproveList />, /Không có nhật ký nào đang chờ duyệt/],
    ['FarmerJournalList', () => <FarmerJournalList />, /Bạn chưa ghi nhật ký nào/],
    ['OfficerJournalApproval', () => <OfficerJournalApproval />, /Chưa có nhật ký nào cần duyệt/],
    ['FarmZoneReadOnly', () => <FarmZoneReadOnly />, /Không tìm thấy thửa đất nào/],
  ])('%s shows its empty state', async (_name, element, emptyState) => {
    global.fetch = answer(200, { data: [] })
    render(element())
    expect(await screen.findByText(emptyState)).toBeInTheDocument()
    expect(screen.queryByText(LOAD_FAILED)).not.toBeInTheDocument()
  })

  test('the disease detail page still says a report is missing', async () => {
    global.fetch = answer(200, { data: [] })
    render(<OfficerDiseaseDetailPage params={{ id: 'd1' }} />)
    expect(await screen.findByText('Không tìm thấy báo cáo bệnh (hoặc đã duyệt).')).toBeInTheDocument()
  })
})

describe('HouseholdProfile', () => {
  const byUrl = (household: number, parcels: number) =>
    jest.fn((url: string) => {
      const status = url.includes('/api/farm/households/') ? household : parcels
      return Promise.resolve({
        ok: status < 400,
        status,
        json: async () => ({ data: url.includes('households') ? { id: 'h1', name: 'A' } : [] }),
      })
    }) as unknown as typeof fetch

  test.each([
    ['the household read', 503, 200],
    ['the parcels read', 200, 503],
  ])('%s failing says the data could not be loaded', async (_name, household, parcels) => {
    global.fetch = byUrl(household, parcels)
    render(<HouseholdProfile id="h1" />)
    expect(await screen.findByText(LOAD_FAILED)).toBeInTheDocument()
  })

  test.each([
    ['the household read', 401, 200],
    ['the parcels read', 200, 401],
  ])('a 401 on %s goes to login', async (_name, household, parcels) => {
    global.fetch = byUrl(household, parcels)
    render(<HouseholdProfile id="h1" />)
    await waitFor(() => expect(redirectToLogin).toHaveBeenCalled())
  })

  test.each([404, 403])('a %i keeps the not-found message', async (status) => {
    global.fetch = byUrl(status, 200)
    render(<HouseholdProfile id="h1" />)
    expect(await screen.findByText('Không tìm thấy nông hộ này hoặc bạn không có quyền truy cập.')).toBeInTheDocument()
  })
})

describe('Step1Household', () => {
  const withHouseholds = (status: number, body: unknown) =>
    jest.fn((url: string) =>
      Promise.resolve(
        url.includes('/api/profile')
          ? { ok: true, status: 200, json: async () => ({ data: { id: 'htx' } }) }
          : { ok: status < 400, status, json: async () => body }
      )
    ) as unknown as typeof fetch
  const element = <Step1Household selectedHouseholdId={null} onSelect={noop} onNext={noop} />

  test('says the households could not be loaded when the core is down', async () => {
    global.fetch = withHouseholds(503, down)
    render(element)
    expect(await screen.findByText(LOAD_FAILED)).toBeInTheDocument()
  })

  test('goes to login on a 401', async () => {
    global.fetch = withHouseholds(401, {})
    render(element)
    await waitFor(() => expect(redirectToLogin).toHaveBeenCalled())
  })
})
