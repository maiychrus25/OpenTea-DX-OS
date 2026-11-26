/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CreateProposalUseCase, type CreateProposalInput } from '@/application/agent/CreateProposalUseCase'
import { disabledConfig, type AutopilotConfig } from '@/domain/agent/autopilot'
import { canonicalJson, evidenceDigest, sha256Hex } from '@/domain/agent/evidence'

const rows = [{ table: 'journal_entries', id: 'entry-1', sha256: 'hash-1' }]
const evidence = { rows, sha256: evidenceDigest(rows) }
const loaders = { journal_entries: jest.fn(async () => ({ id: 'entry-1' })), parcel_crop_cycles: jest.fn(async () => ({})) }
const NOW = new Date('2026-11-27T05:00:00.000Z')

const reject: CreateProposalInput = {
  htxCode: 'TC',
  agent: 'journal-review',
  kind: 'journal.reject',
  payload: { entry_id: 'entry-1', decision: 'REQUEST_CHANGES', reason_code: 'WITHDRAWAL_PERIOD', reason_vi: 'Thiếu số ngày cách ly chuẩn 7 ngày' },
  reasonVi: 'Thiếu ngày cách ly',
  evidence,
  origin: 'agent',
  now: NOW,
}
const approve: CreateProposalInput = { ...reject, kind: 'journal.approve', payload: { entry_ids: ['entry-1'] }, reasonVi: 'Sạch' }

function build(config: AutopilotConfig | Error | null) {
  const repo = { create: jest.fn().mockResolvedValue({ id: 'prop-1' }), createdSince: jest.fn().mockResolvedValue(false) }
  const autopilot = config === null ? undefined : { get: jest.fn(async () => { if (config instanceof Error) throw config; return config }) }
  return { repo, useCase: new CreateProposalUseCase(repo, loaders, autopilot) }
}
const on = (unlockedKinds: string[] = []): AutopilotConfig => ({ ...disabledConfig('TC'), enabled: true, enabledBy: 'm1', unlockedKinds })
const created = (repo: { create: jest.Mock }) => repo.create.mock.calls[0][0]

describe('CreateProposalUseCase autonomous mode hook', () => {
  test('mode off: shadow is recorded and there is no window', async () => {
    const { repo, useCase } = build(disabledConfig('TC'))
    await useCase.execute(reject)
    expect(created(repo)).toMatchObject({ shadowAuto: true, runAt: null })
    const unlockable = build(disabledConfig('TC'))
    await unlockable.useCase.execute(approve)
    // Shadow treats every unlockable kind as opened; the mode being off gives no window.
    expect(created(unlockable.repo)).toMatchObject({ shadowAuto: true, runAt: null })
  })

  test('no autopilot dependency: shadow only', async () => {
    const { repo, useCase } = build(null)
    await useCase.execute(reject)
    expect(created(repo)).toMatchObject({ shadowAuto: true })
    expect(created(repo).runAt ?? null).toBeNull()
  })

  test('mode on: a medium kind gets run_at 15 minutes ahead', async () => {
    const { repo, useCase } = build(on())
    await useCase.execute(reject)
    expect(created(repo).runAt).toEqual(new Date(NOW.getTime() + 15 * 60_000))
  })

  test('mode on: an unlockable kind waits unless it was opened at enable time', async () => {
    const closed = build(on())
    await closed.useCase.execute(approve)
    expect(created(closed.repo)).toMatchObject({ shadowAuto: true, runAt: null })

    const opened = build(on(['journal.approve']))
    await opened.useCase.execute(approve)
    expect(created(opened.repo).runAt).toEqual(new Date(NOW.getTime() + 15 * 60_000))
  })

  test('mode on: a user proposal never gets a window and has no shadow', async () => {
    const { repo, useCase } = build(on(['journal.approve']))
    await useCase.execute({ ...approve, origin: 'user', requestedBy: 'u1' })
    expect(created(repo)).toMatchObject({ shadowAuto: false, runAt: null })
  })

  test('mode on: a loosening settings change never gets a window (test 31)', async () => {
    const values = { thresholds: { dry_soil_pct: 35 } }
    const settingsRows = [{ table: 'agent_settings', id: 'field-watch', sha256: sha256Hex(canonicalJson(values)), values }]
    const settings = { ...reject, agent: 'improvement' as const, kind: 'agent.settings.update', reasonVi: 'x', evidence: { rows: settingsRows, sha256: evidenceDigest(settingsRows) } }
    const tighten = build(on())
    const withLoader = { ...loaders, agent_settings: jest.fn(async () => ({})) }
    const useCase = new CreateProposalUseCase(tighten.repo, withLoader, { get: async () => on() })
    await useCase.execute({ ...settings, payload: { agent: 'field-watch', thresholds: { dry_soil_pct: 40 } } })
    expect(tighten.repo.create.mock.calls[0][0].runAt).toEqual(new Date(NOW.getTime() + 15 * 60_000))

    const loosen = build(on())
    await new CreateProposalUseCase(loosen.repo, withLoader, { get: async () => on() }).execute({
      ...settings,
      payload: { agent: 'field-watch', thresholds: { dry_soil_pct: 30 } },
    })
    expect(loosen.repo.create.mock.calls[0][0]).toMatchObject({ shadowAuto: false, runAt: null })
  })

  test('a failed read of the mode leaves the proposal for a person and still creates it', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { repo, useCase } = build(new Error('db down'))
    await expect(useCase.execute(reject)).resolves.toEqual({ id: 'prop-1' })
    expect(created(repo)).toMatchObject({ runAt: null })
  })
})
