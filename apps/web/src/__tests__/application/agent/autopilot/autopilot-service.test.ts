/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AutopilotService, ReauthRequiredError } from '@/application/agent/autopilot/AutopilotService'
import { disabledConfig, type AutopilotConfig } from '@/domain/agent/autopilot'
import type { AutopilotRepository } from '@/domain/agent/ports/AutopilotRepository'
import { ValidationError } from '@/domain/errors'

const NOW = new Date('2026-11-27T05:00:00.000Z')
const nowSeconds = NOW.getTime() / 1000

function build(config: AutopilotConfig = disabledConfig('TC'), rates: { kind: string; sample: number; matched: number }[] = []) {
  const repo = {
    get: jest.fn(async () => config),
    matchRates: jest.fn(async () => rates),
    dayCounts: jest.fn(async () => ({ autoRuns: 3, blocked: 1, failuresLastHour: 0 })),
    countPending: jest.fn(async () => 2),
    enable: jest.fn(async () => undefined),
    stop: jest.fn(async () => ({ returned: 4 })),
  }
  const notifier = { enabled: jest.fn(async () => undefined), stopped: jest.fn(async () => undefined) }
  const service = new AutopilotService({ autopilot: repo as unknown as AutopilotRepository, notifier, now: () => NOW })
  return { repo, notifier, service }
}

const enableInput = {
  htxCode: 'TC',
  userId: 'mgr-1',
  userName: 'Lan',
  unlockedKinds: ['harvest.approve'],
  dailyCap: 20,
  acknowledged: true,
  authTime: nowSeconds - 60,
  now: NOW,
}

describe('AutopilotService.view', () => {
  test('rates are computed from the decided sample and warn under 90% (test 25)', async () => {
    const { service, repo } = build(disabledConfig('TC'), [
      { kind: 'journal.reject', sample: 20, matched: 19 },
      { kind: 'notification.internal', sample: 10, matched: 8 },
      { kind: 'bulletin.publish', sample: 10, matched: 9 },
    ])
    const view = await service.view('TC')
    const kind = (name: string) => view.kinds.find((k) => k.kind === name)!
    expect(kind('journal.reject')).toMatchObject({ match_rate: 0.95, sample: 20, warning: false })
    expect(kind('notification.internal')).toMatchObject({ match_rate: 0.8, sample: 10, warning: true })
    expect(kind('bulletin.publish')).toMatchObject({ match_rate: 0.9, warning: false })
    expect(kind('agent.settings.update')).toMatchObject({ match_rate: null, sample: 0, warning: false })
    // The sample is the last 30 days.
    expect(repo.matchRates).toHaveBeenCalledWith('TC', new Date(NOW.getTime() - 30 * 86_400_000))
  })

  test('lists every catalogue kind with its autonomy, risk and window', async () => {
    const view = await build().service.view('TC')
    const byKind = Object.fromEntries(view.kinds.map((k) => [k.kind, k]))
    expect(Object.keys(byKind).sort()).toHaveLength(13)
    expect(byKind['notification.internal']).toMatchObject({ autonomy: 'auto', risk: 'low', window_minutes: 0 })
    expect(byKind['journal.reject']).toMatchObject({ autonomy: 'auto', window_minutes: 15 })
    expect(byKind['harvest.approve']).toMatchObject({ autonomy: 'unlockable', risk: 'high', window_minutes: 120 })
    expect(byKind['improvement.adopt'].autonomy).toBe('never')
  })

  test('shows the mode, the opened kinds and today\'s counts', async () => {
    const on: AutopilotConfig = { ...disabledConfig('TC'), enabled: true, enabledByName: 'Lan', enabledAt: NOW, unlockedKinds: ['journal.approve'], dailyCap: 30 }
    const view = await build(on).service.view('TC')
    expect(view).toMatchObject({ enabled: true, enabled_by_name: 'Lan', daily_cap: 30, today: { ran: 3, blocked: 1, pending: 2 } })
    expect(view.kinds.find((k) => k.kind === 'journal.approve')!.unlocked).toBe(true)
    expect(view.kinds.find((k) => k.kind === 'harvest.approve')!.unlocked).toBe(false)
  })
})

describe('AutopilotService.enable', () => {
  test('turns the mode on with the screen as a snapshot and tells the notifier', async () => {
    const { service, repo, notifier } = build(disabledConfig('TC'), [{ kind: 'harvest.approve', sample: 10, matched: 7 }])
    await service.enable(enableInput)
    expect(repo.enable).toHaveBeenCalledWith('TC', {
      userId: 'mgr-1',
      userName: 'Lan',
      unlockedKinds: ['harvest.approve'],
      dailyCap: 20,
      snapshot: expect.objectContaining({ daily_cap: 20, acknowledged: true }),
    })
    const snapshot = (repo.enable.mock.calls[0] as unknown as [string, { snapshot: { kinds: { kind: string; unlocked: boolean; match_rate: number | null; warning: boolean }[] } }])[1].snapshot
    expect(snapshot.kinds.find((k) => k.kind === 'harvest.approve')).toMatchObject({ unlocked: true, match_rate: 0.7, warning: true })
    expect(snapshot.kinds.find((k) => k.kind === 'journal.approve')!.unlocked).toBe(false)
    expect(notifier.enabled).toHaveBeenCalledWith('TC', 'Lan', ['harvest.approve'], 20)
  })

  test('a sign-in older than five minutes, or unknown, needs a fresh one and writes nothing', async () => {
    const { service, repo } = build()
    await expect(service.enable({ ...enableInput, authTime: nowSeconds - 301 })).rejects.toBeInstanceOf(ReauthRequiredError)
    await expect(service.enable({ ...enableInput, authTime: undefined })).rejects.toBeInstanceOf(ReauthRequiredError)
    expect(repo.enable).not.toHaveBeenCalled()
    await expect(service.enable({ ...enableInput, authTime: nowSeconds - 299 })).resolves.toBeDefined()
  })

  test('refuses without the acknowledgement, with a kind that cannot be opened, or a bad cap', async () => {
    const { service, repo } = build()
    await expect(service.enable({ ...enableInput, acknowledged: false })).rejects.toBeInstanceOf(ValidationError)
    for (const kind of ['journal.reject', 'improvement.adopt', 'no.such.kind', '__proto__']) {
      await expect(service.enable({ ...enableInput, unlockedKinds: [kind] })).rejects.toBeInstanceOf(ValidationError)
    }
    for (const dailyCap of [0, 51, 2.5]) {
      await expect(service.enable({ ...enableInput, dailyCap })).rejects.toBeInstanceOf(ValidationError)
    }
    expect(repo.enable).not.toHaveBeenCalled()
  })

  test('a failed Telegram notice does not undo the change', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { service, notifier } = build()
    notifier.enabled.mockRejectedValueOnce(new Error('outbox down'))
    await expect(service.enable(enableInput)).resolves.toBeDefined()
  })
})

describe('AutopilotService.stop', () => {
  test('stops with reason manual, answers how many windows went back, and tells people', async () => {
    const { service, repo, notifier } = build()
    expect(await service.stop('TC', 'off-1')).toEqual({ returned: 4 })
    expect(repo.stop).toHaveBeenCalledWith('TC', 'manual', 'off-1')
    expect(notifier.stopped).toHaveBeenCalledWith('TC', 'manual', 4, 50)
  })

  test('already off answers null and tells nobody', async () => {
    const { service, repo, notifier } = build()
    repo.stop.mockResolvedValueOnce(null as never)
    expect(await service.stop('TC', 'off-1')).toBeNull()
    expect(notifier.stopped).not.toHaveBeenCalled()
  })
})
