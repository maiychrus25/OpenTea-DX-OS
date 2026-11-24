/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { alertBudgetThresholds, cooperativeBudgetLevel } from '@/application/agent/agent-budget'

const loadMock = jest.fn()
const spentMock = jest.fn()
const queueBudgetAlertMock = jest.fn()

jest.mock('@/infrastructure/db/agent/PrismaAgentSettingsRepository', () => ({
  PrismaAgentSettingsRepository: jest.fn().mockImplementation(() => ({ load: loadMock })),
}))
jest.mock('@/infrastructure/db/agent/PrismaAgentRunRepository', () => ({
  PrismaAgentRunRepository: jest.fn().mockImplementation(() => ({ spentBetween: spentMock })),
}))
jest.mock('@/application/telegram/telegram-services', () => ({
  telegramNotifier: () => ({ queueBudgetAlert: queueBudgetAlertMock }),
}))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))

// 2026-11-15 in Vietnam, so the month is 2026-11 and starts at 2026-10-31T17:00Z.
const NOW = new Date('2026-11-15T03:00:00.000Z')

describe('Monthly agent budget alerts (C7)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    loadMock.mockResolvedValue({ agents: {}, monthlyLimit: 10 })
  })

  test('under 80% nothing is queued', async () => {
    spentMock.mockResolvedValue(7.5)
    await alertBudgetThresholds('TC', NOW)
    expect(queueBudgetAlertMock).not.toHaveBeenCalled()
  })

  test('from 80% the 80% warning is queued with the Vietnam month start', async () => {
    spentMock.mockResolvedValue(8.2)
    await alertBudgetThresholds('TC', NOW)
    expect(queueBudgetAlertMock).toHaveBeenCalledTimes(1)
    expect(queueBudgetAlertMock).toHaveBeenCalledWith(
      'TC', '2026-11', 80, 8.2, 10, new Date('2026-10-31T17:00:00.000Z')
    )
  })

  test('from 100% both warnings are offered; the notifier dedupes each per month', async () => {
    spentMock.mockResolvedValue(10.4)
    await alertBudgetThresholds('TC', NOW)
    expect(queueBudgetAlertMock.mock.calls.map((call) => call[2])).toEqual([80, 100])
  })

  test('without a monthly budget nothing is checked further', async () => {
    loadMock.mockResolvedValue({ agents: {}, monthlyLimit: null })
    spentMock.mockResolvedValue(999)
    await alertBudgetThresholds('TC', NOW)
    expect(queueBudgetAlertMock).not.toHaveBeenCalled()
  })

  test('a failure while checking is logged and never thrown to the run', async () => {
    loadMock.mockRejectedValue(new Error('db down'))
    await expect(alertBudgetThresholds('TC', NOW)).resolves.toBeUndefined()
  })

  test('the inbox banner level falls back to none when the lookup fails', async () => {
    loadMock.mockRejectedValue(new Error('db down'))
    await expect(cooperativeBudgetLevel('TC')).resolves.toBe('none')
  })
})
