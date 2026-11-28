// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync } from 'fs'
import { join } from 'path'
import { DISEASE_LABEL_VI } from '@/application/agent/actions/disease-labels'

const root = join(__dirname, '..', '..', '..', '..', '..')
const prismaDir = join(root, 'apps', 'web', 'prisma')
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8')
const labelsSql = readFileSync(join(prismaDir, 'migrations', '20261128180000_disease_labels', 'migration.sql'), 'utf8')
const consentSql = readFileSync(join(prismaDir, 'migrations', '20261128180100_disease_training_consent', 'migration.sql'), 'utf8')
const auditInit = readFileSync(join(root, 'platform', 'postgres', 'init', '03-audit-triggers.sql'), 'utf8')
const modelClasses = JSON.parse(readFileSync(join(root, 'ai-models', 'tea_class_names_vi.json'), 'utf8')) as Record<string, { vi: string }>

// ('code', 'name', ...) rows of the seed; a doubled quote is one quote.
const seed = Array.from(labelsSql.matchAll(/^\s+\('([a-z_]+)', '((?:[^']|'')+)', (?:NULL|'[^']*'), '([A-Z]+)', (true|false), (\d+)\)/gm)).map((m) => ({
  code: m[1], name_vi: m[2].replace(/''/g, "'"), group: m[3], is_target: m[4] === 'true', sort_order: Number(m[5]),
}))

describe('disease_labels seed', () => {
  it('has the five targets first, the model classes, healthy, not_tea_leaf and other', () => {
    expect(seed.filter((l) => l.is_target).map((l) => [l.code, l.name_vi])).toEqual([
      ['green_leafhopper', 'Rầy xanh'], ['tea_thrips', 'Bọ cánh tơ'], ['red_spider_mite', 'Nhện đỏ'], ['blister_blight', 'Phồng lá chè'], ['helopeltis', 'Bọ xít muỗi'],
    ])
    for (const [code, { vi }] of Object.entries(modelClasses)) expect(seed).toContainEqual(expect.objectContaining({ code, name_vi: vi }))
    for (const code of ['healthy', 'not_tea_leaf', 'other']) expect(seed.map((l) => l.code)).toContain(code)
    expect(new Set(seed.map((l) => l.code)).size).toBe(seed.length)
    expect(seed).toHaveLength(14)
  })

  it('is the source of the names the agent actions use', () => {
    const proposable = Object.fromEntries(seed.filter((l) => !['healthy', 'not_tea_leaf', 'other'].includes(l.code)).map((l) => [l.code, l.name_vi]))
    expect(DISEASE_LABEL_VI).toEqual(proposable)
  })
})

describe('GĐ4-B schema', () => {
  it('links the report to the label table and records the model version', () => {
    expect(schema).toMatch(/confirmed_label_code\s+String\?/)
    expect(schema).toMatch(/model_version\s+String\?/)
    expect(labelsSql).toContain('"disease_reports_confirmed_label_code_fkey"')
    expect(labelsSql).toMatch(/"confirmed_diagnosis" = l\."name_vi"/)
  })

  it('keeps training consent off by default and audits the label table', () => {
    expect(consentSql).toContain('"disease_training_consent" BOOLEAN NOT NULL DEFAULT false')
    expect(labelsSql).toContain('public.disease_labels')
    expect(auditInit).toContain("'disease_labels'")
  })
})
