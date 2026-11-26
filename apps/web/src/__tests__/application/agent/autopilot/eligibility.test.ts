/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { ACTION_CATALOG, getAction } from '@/application/agent/action-catalog'
import { autoEligibility, shadowEligibility, windowFor } from '@/application/agent/autopilot/eligibility'
import { evidenceDigest } from '@/domain/agent/evidence'
import type { Evidence } from '@/domain/agent/proposal'

const emptyEvidence: Evidence = { rows: [], sha256: evidenceDigest([]) }
const normal = { unlockedKinds: [] as string[] }

function settingsEvidence(thresholds: Record<string, number>): Evidence {
  const rows = [{ table: 'agent_settings', id: 'field-watch', sha256: 'h', values: { thresholds } }]
  return { rows, sha256: evidenceDigest(rows) }
}

function check(kind: string, payload: Record<string, unknown> = {}, config = normal, origin: 'agent' | 'user' = 'agent', evidence = emptyEvidence) {
  return autoEligibility({ origin, payload, evidence }, getAction(kind)!, config)
}

describe('autoEligibility', () => {
  test('the catalogue holds exactly the known kinds (test 19)', () => {
    expect(Object.keys(ACTION_CATALOG).sort()).toEqual([
      'agent.settings.update',
      'bulletin.publish',
      'disease.inspection',
      'harvest.approve',
      'improvement.adopt',
      'journal.approve',
      'journal.reject',
      'notification.households',
      'notification.internal',
      'staff.task.create',
    ])
  })

  test('no kind touches the mode, the limits, roles, keys, budgets, data policy or the audit (tests 19, H2, H3, H4)', () => {
    const dir = path.join(__dirname, '../../../../application/agent/actions')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.action.ts'))) {
      const source = readFileSync(path.join(dir, file), 'utf8')
      expect(`${file}: ${/autopilot|audit\.(record_event|events)|role-mappings|assignRole|setRole/i.test(source)}`).toBe(`${file}: false`)
    }
    for (const definition of Object.values(ACTION_CATALOG)) {
      expect(definition.execute.toString()).not.toMatch(/autopilot/i)
      // H3 and H4: no disease report review, no delete.
      expect(definition.kind).not.toMatch(/delete|remove|report/)
      expect(definition.kind).not.toMatch(/^(role|key|budget|policy|catalog|autopilot)/)
    }
  })

  test.each([
    ['journal.reject', true],
    ['notification.internal', true],
    ['notification.households', true],
    ['disease.inspection', true],
    ['bulletin.publish', true],
    ['staff.task.create', true],
    ['journal.approve', false],
    ['harvest.approve', false],
    ['improvement.adopt', false],
  ])('%s in normal config: eligible %s (test 18)', (kind, eligible) => {
    expect(check(kind).eligible).toBe(eligible)
  })

  test('agent.settings.update needs a tightening change', () => {
    expect(check('agent.settings.update', { agent: 'field-watch', thresholds: { dry_soil_pct: 40 } }).eligible).toBe(true)
  })

  test('every never kind and every unopened unlockable kind is not eligible; opening only frees unlockable (test 18)', () => {
    for (const definition of Object.values(ACTION_CATALOG)) {
      if (definition.autonomy === 'never') {
        expect(check(definition.kind, {}, { unlockedKinds: [definition.kind] }).eligible).toBe(false)
      }
      if (definition.autonomy === 'unlockable') {
        expect(check(definition.kind).reason).toBe('not_unlocked')
        expect(check(definition.kind, {}, { unlockedKinds: [definition.kind] }).eligible).toBe(true)
        // Opening another kind does not open this one.
        expect(check(definition.kind, {}, { unlockedKinds: ['something.else'] }).eligible).toBe(false)
      }
    }
  })

  test('a user proposal is never eligible, whatever the kind or unlock', () => {
    for (const definition of Object.values(ACTION_CATALOG)) {
      expect(check(definition.kind, {}, { unlockedKinds: [definition.kind] }, 'user').eligible).toBe(false)
    }
  })

  test('a kind a manager cannot decide is not eligible', () => {
    const officerOnly = { ...getAction('journal.reject')!, approverRoles: ['officer'] as const }
    expect(autoEligibility({ origin: 'agent', payload: {}, evidence: emptyEvidence }, officerOnly, normal).reason).toBe(
      'manager_cannot_decide'
    )
  })

  describe('agent.settings.update (test 31)', () => {
    const evidence = settingsEvidence({ dry_soil_pct: 35, heat_c: 35 })
    const update = (thresholds: Record<string, number>, agent = 'field-watch') =>
      check('agent.settings.update', { agent, thresholds }, normal, 'agent', evidence)

    test('tightening in either direction is eligible', () => {
      expect(update({ dry_soil_pct: 40 }).eligible).toBe(true) // higher is stricter
      expect(update({ heat_c: 30 }).eligible).toBe(true) // lower is stricter
      expect(update({ dry_soil_pct: 40, heat_c: 30 }).eligible).toBe(true)
    })

    test('a loosening change is never eligible, alone or mixed', () => {
      expect(update({ dry_soil_pct: 30 })).toEqual({ eligible: false, reason: 'loosens_setting' })
      expect(update({ heat_c: 40 }).eligible).toBe(false)
      expect(update({ dry_soil_pct: 40, heat_c: 40 }).eligible).toBe(false)
    })

    test('a value that is not in the evidence compares with the default', () => {
      // heavy_rain_mm defaults to 15; 10 is stricter, 20 is looser.
      expect(update({ heavy_rain_mm: 10 }).eligible).toBe(true)
      expect(update({ heavy_rain_mm: 20 }).eligible).toBe(false)
    })

    test('an unknown key or an unknown agent is not eligible', () => {
      expect(update({ unknown_key: 1 }).eligible).toBe(false)
      expect(update({ dry_soil_pct: 40 }, 'ghost').eligible).toBe(false)
    })

    test('a schedule-only change counts as tightening', () => {
      expect(check('agent.settings.update', { agent: 'digest', schedule: '19:00' }).eligible).toBe(true)
    })
  })

  describe('journal.approve', () => {
    const open = { unlockedKinds: ['journal.approve'] }
    test('clean entries run when opened; a rule warning never runs', () => {
      expect(check('journal.approve', { entry_ids: ['e1'] }, open).eligible).toBe(true)
      expect(check('journal.approve', { entry_ids: ['e1'], warnings: [] }, open).eligible).toBe(true)
      expect(check('journal.approve', { entry_ids: ['e1'], warnings: ['WITHDRAWAL'] }, open)).toEqual({
        eligible: false,
        reason: 'rule_warning',
      })
    })
  })
})

describe('shadowEligibility', () => {
  test('treats every unlockable kind as opened, and nothing else', () => {
    expect(shadowEligibility({ origin: 'agent', payload: {}, evidence: emptyEvidence }, getAction('journal.approve')!)).toBe(true)
    expect(shadowEligibility({ origin: 'agent', payload: {}, evidence: emptyEvidence }, getAction('improvement.adopt')!)).toBe(false)
    expect(shadowEligibility({ origin: 'user', payload: {}, evidence: emptyEvidence }, getAction('journal.reject')!)).toBe(false)
  })
})

describe('windowFor', () => {
  const minutes = (kind: string) => windowFor(getAction(kind)!) / 60_000
  test('follows the risk', () => {
    expect(minutes('notification.internal')).toBe(0) // low
    expect(minutes('journal.reject')).toBe(15) // medium
    expect(minutes('harvest.approve')).toBe(120) // high
  })
  test('strategy.adopt waits 48 hours', () => {
    expect(windowFor({ kind: 'strategy.adopt', risk: 'high' }) / 3_600_000).toBe(48)
  })
})
