/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { PrismaImprovementRepository } from '@/infrastructure/db/agent/PrismaImprovementRepository'

const queryRaw = jest.fn()
const executeRaw = jest.fn()
const transaction = jest.fn()

jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args),
    $transaction: (fn: (tx: unknown) => unknown) => transaction(fn),
  },
}))

const row = {
  id: 'imp-1',
  htx_code: 'TC',
  week: '2026-11-30',
  kind: 'setting',
  metric_key: 'reject_rate:field-watch:sensor_silent',
  title_vi: 'Nới ngưỡng cảm biến im lặng',
  rationale_vi: 'Số liệu.',
  baseline: 0.85,
  evidence: { rows: [] },
  proposal_id: 'prop-1',
  status: 'proposed',
  decided_by: null,
  adopted_at: null,
  effect: {},
  template: null,
  created_at: new Date('2026-11-30T06:30:00Z'),
}

describe('PrismaImprovementRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({ $executeRaw: executeRaw, $queryRaw: queryRaw }))
  })

  it('maps a stored row to the domain shape', async () => {
    queryRaw.mockResolvedValueOnce([row])
    const found = await new PrismaImprovementRepository().findById('TC', 'imp-1')
    expect(found).toMatchObject({
      id: 'imp-1',
      htxCode: 'TC',
      week: '2026-11-30',
      kind: 'setting',
      metricKey: 'reject_rate:field-watch:sensor_silent',
      baseline: 0.85,
      proposalId: 'prop-1',
      status: 'proposed',
      effect: {},
      template: null,
    })
  })

  it('returns null when the cooperative has no such improvement', async () => {
    queryRaw.mockResolvedValueOnce([])
    expect(await new PrismaImprovementRepository().findById('TC', 'missing')).toBeNull()
  })

  it('returns null from insertIfNew when the week and metric already exist', async () => {
    queryRaw.mockResolvedValueOnce([])
    const result = await new PrismaImprovementRepository().insertIfNew({
      htxCode: 'TC',
      week: '2026-11-30',
      kind: 'process',
      metricKey: 'journal_missing_info_rate',
      titleVi: 'Bắt buộc ghi liều lượng',
      rationaleVi: 'Số liệu.',
      baseline: 0.5,
      evidence: {},
      template: null,
    })
    expect(result).toBeNull()
  })
})
