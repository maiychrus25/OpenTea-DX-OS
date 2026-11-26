// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CampaignPanel, CampaignPanelView, type CampaignPanelViewProps } from '@/components/features/agent/CampaignPanel'
import type { CampaignView } from '@/application/agent/campaign/campaign-view'

const draft: CampaignView = {
  id: 'c1',
  day: '2026-11-27',
  status: 'draft',
  summaryVi: 'Hôm nay có hai việc.',
  decidedByName: null,
  items: [
    { position: 1, proposalId: 'p1', kind: 'harvest.approve', titleVi: 'Duyệt thu hoạch', status: 'proposed', risk: 'high', goalLine: '1 thửa' },
    { position: 2, proposalId: 'p2', kind: 'notification.internal', titleVi: 'Thông báo nội bộ', status: 'proposed', risk: 'low', goalLine: '1 tin' },
  ],
}

function viewProps(overrides: Partial<CampaignPanelViewProps> = {}): CampaignPanelViewProps {
  return {
    campaign: draft,
    busy: false,
    result: null,
    error: null,
    onApproveAll: jest.fn(),
    onDrop: jest.fn(),
    ...overrides,
  }
}

describe('CampaignPanelView', () => {
  test('a draft shows its items, the high-risk tag and both decisions', () => {
    render(<CampaignPanelView {...viewProps()} />)
    expect(screen.getByRole('heading', { name: 'Chiến dịch hôm nay' })).toBeInTheDocument()
    expect(screen.getAllByText('Chờ duyệt')).toHaveLength(3)
    expect(screen.getByText('Rủi ro cao')).toBeInTheDocument()
    expect(screen.getByText('Duyệt thu hoạch')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duyệt cả chiến dịch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bỏ chiến dịch' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Xem trong danh sách' })[0]).toHaveAttribute('href', '#proposal-p1')
  })

  test('an approved campaign offers no decision', () => {
    render(<CampaignPanelView {...viewProps({ campaign: { ...draft, status: 'approved' } })} />)
    expect(screen.getByText('Đã duyệt')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duyệt cả chiến dịch' })).not.toBeInTheDocument()
  })

  test('after approve all the result line shows the counts', () => {
    const result = { executed: 1, waitingHigh: 1, forwarded: 0, failed: 0, alreadyDecided: 0 }
    render(<CampaignPanelView {...viewProps({ campaign: { ...draft, status: 'partial' }, result })} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đã duyệt chiến dịch: 1 việc đã chạy, 1 việc chờ xác nhận riêng, 0 việc chuyển người đủ quyền.'
    )
  })

  test('drop asks for confirmation before it runs', () => {
    const onDrop = jest.fn()
    render(<CampaignPanelView {...viewProps({ onDrop })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chiến dịch' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Bỏ chiến dịch hôm nay?')).toBeInTheDocument()
    expect(onDrop).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Quay lại' }))
    expect(onDrop).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chiến dịch' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bỏ chiến dịch' }))
    expect(onDrop).toHaveBeenCalledTimes(1)
  })
})

describe('CampaignPanel (container)', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  const jsonResponse = (body: unknown, status = 200) =>
    Promise.resolve({ ok: status < 400, status, json: async () => body } as Response)

  test('renders nothing when the cooperative has no campaign today', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ campaign: null }))
    const { container } = render(<CampaignPanel />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/agent/campaigns/today'))
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull())
    expect(container).toBeEmptyDOMElement()
  })

  test('approve all posts the decision and shows the result from the answer', async () => {
    const counts = { executed: 2, waitingHigh: 0, forwarded: 0, failed: 0, alreadyDecided: 0 }
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ data: counts })
      return jsonResponse({ campaign: draft })
    })
    render(<CampaignPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt cả chiến dịch' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/agent/campaigns/c1/decision',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'approve_all' }) })
      )
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Đã duyệt chiến dịch: 2 việc đã chạy')
  })

  test('a campaign closed by someone else shows its refusal and reloads', async () => {
    let posted = false
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted = true
        return jsonResponse({ error: { code: 'CAMPAIGN_CLOSED', message: 'Chiến dịch đã được xử lý.' } }, 409)
      }
      return jsonResponse({ campaign: posted ? { ...draft, status: 'approved' } : draft })
    })
    render(<CampaignPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt cả chiến dịch' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Chiến dịch đã được xử lý.')
  })
})
