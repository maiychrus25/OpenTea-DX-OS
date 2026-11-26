// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import type { Evidence } from '@/domain/agent/proposal'
import { PrismaAgentSettingsRepository } from '@/infrastructure/db/agent/PrismaAgentSettingsRepository'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'

export type SettingDirection = 'lower' | 'higher'

/** `stricter` is the direction that tightens an agent: lower for `silent_hours` (it fires sooner), higher for `dry_soil_pct`. */
export interface ThresholdSetting {
  label: string
  unit: string
  min: number
  max: number
  stricter: SettingDirection
  defaultValue: number
}

/** The keys A10 may change (contract C2). Exported for M12, which allows tightening only. */
export const SETTING_KEYS = {
  'field-watch': {
    thresholds: {
      silent_hours: { label: 'Cảm biến im lặng', unit: 'giờ', min: 1, max: 48, stricter: 'lower', defaultValue: 6 },
      dry_soil_pct: { label: 'Đất khô', unit: '%', min: 5, max: 80, stricter: 'higher', defaultValue: 35 },
      heat_c: { label: 'Nắng nóng', unit: '°C', min: 25, max: 50, stricter: 'lower', defaultValue: 35 },
      frost_c: { label: 'Sương muối', unit: '°C', min: -5, max: 15, stricter: 'higher', defaultValue: 4 },
      heavy_rain_mm: { label: 'Mưa lớn', unit: 'mm', min: 1, max: 200, stricter: 'lower', defaultValue: 15 },
    } satisfies Record<string, ThresholdSetting>,
  },
  'disease-watch': {
    thresholds: {
      min_reports: { label: 'Số báo cáo tối thiểu', unit: 'báo cáo', min: 2, max: 20, stricter: 'lower', defaultValue: 3 },
      radius_m: { label: 'Bán kính gom báo cáo', unit: 'm', min: 200, max: 20000, stricter: 'higher', defaultValue: 2000 },
      window_days: { label: 'Số ngày xem lại', unit: 'ngày', min: 1, max: 60, stricter: 'higher', defaultValue: 7 },
    } satisfies Record<string, ThresholdSetting>,
  },
  'harvest-ready': {
    thresholds: {
      harvest_window_days: { label: 'Cửa sổ thu hoạch', unit: 'ngày', min: 0, max: 30, stricter: 'higher', defaultValue: 3 },
    } satisfies Record<string, ThresholdSetting>,
  },
  digest: {
    schedule: { label: 'Giờ báo cáo ngày', min: '05:00', max: '22:00', stricter: null, defaultValue: '18:00' },
  },
} as const

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

const payloadSchema = z
  .object({
    agent: z.enum(['field-watch', 'disease-watch', 'harvest-ready', 'digest']),
    thresholds: z.record(z.number().int()).optional(),
    schedule: z.string().regex(HH_MM).optional(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const keys = Object.keys(payload.thresholds ?? {})
    if (keys.length === 0 && payload.schedule === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Cần ít nhất một ngưỡng hoặc giờ báo cáo' })
      return
    }
    if (payload.agent === 'digest') {
      if (payload.thresholds) ctx.addIssue({ code: 'custom', message: 'Digest chỉ đổi giờ báo cáo' })
      const { min, max } = SETTING_KEYS.digest.schedule
      if (payload.schedule !== undefined && (payload.schedule < min || payload.schedule > max)) {
        ctx.addIssue({ code: 'custom', message: 'Giờ báo cáo nằm ngoài 05:00..22:00' })
      }
      return
    }
    if (payload.schedule !== undefined) ctx.addIssue({ code: 'custom', message: 'Chỉ digest có giờ báo cáo' })
    const defined = (SETTING_KEYS[payload.agent] as { thresholds: Record<string, ThresholdSetting> }).thresholds
    for (const key of keys) {
      const setting = defined[key]
      const value = payload.thresholds![key]
      if (!setting) {
        ctx.addIssue({ code: 'custom', message: `Khóa ${key} không được phép` })
      } else if (value < setting.min || value > setting.max) {
        ctx.addIssue({ code: 'custom', message: `${key} nằm ngoài ${setting.min}..${setting.max}` })
      }
    }
  })

export type AgentSettingsUpdatePayload = z.infer<typeof payloadSchema>

/** The unit follows the value, as in `35% → 30%`, or closes the line, as in `6 → 8 giờ`. */
function formatChange(setting: ThresholdSetting, from: number, to: number): string {
  if (setting.unit === '%') return `${setting.label}: ${from}% → ${to}% `
  return `${setting.label}: ${from} → ${to}${setting.unit ? ` ${setting.unit}` : ''} `
}

/** `siết` when the change makes the agent stricter, `nới` when it loosens it, `không đổi` when the value is kept. */
function strictnessTag(stricter: SettingDirection, from: number, to: number): string {
  if (from === to) return 'không đổi'
  const tightens = stricter === 'lower' ? to < from : to > from
  return tightens ? 'siết' : 'nới'
}

function currentValues(evidence?: Evidence): { thresholds: Record<string, unknown>; schedule: string | null } {
  const row = evidence?.rows.find((r) => r.table === 'agent_settings')
  return {
    thresholds: (row?.values?.thresholds as Record<string, unknown> | undefined) ?? {},
    schedule: (row?.values?.schedule as string | null | undefined) ?? null,
  }
}

export const agentSettingsUpdateAction: ActionDefinition<AgentSettingsUpdatePayload> = {
  kind: 'agent.settings.update',
  titleVi: 'Đổi cài đặt agent',
  risk: 'medium',
  approverRoles: ['manager'],
  origins: ['agent'],
  autonomy: 'auto',
  channels: ['web', 'telegram'],
  payloadSchema,
  editableFields: [],
  humanOnlyFields: [],
  subjectTable: null,
  repeatAfterHours: 168,
  expiresAfterHours: 168,
  preview(payload, _subjects, evidence) {
    const now = currentValues(evidence)
    const lines: string[] = []
    const defined = payload.agent === 'digest' ? {} : (SETTING_KEYS[payload.agent] as { thresholds: Record<string, ThresholdSetting> }).thresholds
    for (const [key, next] of Object.entries(payload.thresholds ?? {})) {
      const setting = defined[key]
      if (!setting) continue
      const from = Number(now.thresholds[key] ?? setting.defaultValue)
      lines.push(`${formatChange(setting, from, next)}(${strictnessTag(setting.stricter, from, next)})`)
    }
    if (payload.schedule !== undefined) {
      const setting = SETTING_KEYS.digest.schedule
      lines.push(`${setting.label}: ${now.schedule ?? setting.defaultValue} → ${payload.schedule}`)
    }
    return lines
  },
  subjects(payload) {
    const keys = Object.keys(payload.thresholds ?? {}).map((key) => `${payload.agent}.${key}`)
    return payload.schedule !== undefined ? [...keys, `${payload.agent}.schedule`] : keys
  },
  async isStale(_payload, evidence, ctx) {
    return isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)
  },
  async execute(payload, approver) {
    const change = await new PrismaAgentSettingsRepository().applyKeys(
      approver.htxCode,
      payload.agent,
      { thresholds: payload.thresholds ?? {}, schedule: payload.schedule ?? null },
      `user:${approver.userId}`
    )
    return { agent: payload.agent, before: change.before, after: change.after }
  },
}
