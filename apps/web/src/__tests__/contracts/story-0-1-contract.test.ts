// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { isPublicResourcePath } from '@/lib/contracts/public-resource-path'
import {
  canonicalRoutes,
  canPerformOfficerMutation,
  farmerIsolationRules,
  routeDeviations,
  schemaDeviations,
  isErrorEnvelope,
  isSuccessEnvelope,
  roleCanAccess,
  roleOwnership,
} from '@/lib/contracts/story-0-1-contract'

const repoRoot = path.resolve(process.cwd(), '..', '..')
const readRepoFile = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const storyStatusSchema = z.enum([
  'backlog',
  'ready-for-dev',
  'in-progress',
  'review',
  'done',
  'partial',
  'blocked',
  'deferred',
])

describe('Story 0.1 contract inventory', () => {
  it('0.1-CONTRACT-001 resolves the story and its test artifact', () => {
    const story = readRepoFile('_bmad-output/implementation-artifacts/0-1-contract-schema-route-reconciliation.md')
    const testArtifact = readRepoFile('_bmad-output/test-artifacts/0-1-contract-schema-route-reconciliation-tests.md')

    expect(story).toContain('## Dependencies')
    expect(story).toContain('## Test Plan')
    expect(testArtifact).toContain('0.1-CONTRACT-001')
    expect(testArtifact).toContain('0.1-SCHEMA-001')
    expect(testArtifact).toContain('0.1-ROUTE-001')
  })

  it('0.1-CONTRACT-002 tracks every non-done story without hiding missing artifacts', () => {
    const status = readRepoFile('_bmad-output/implementation-artifacts/sprint-status.yaml')
    const artifactFiles = fs.readdirSync(path.join(repoRoot, '_bmad-output', 'test-artifacts'))
    const artifactNames = new Set(artifactFiles.map((file) => file.toLowerCase()))

    const storyKeys = Array.from(status.matchAll(/^\s{2}([0-9]+-[0-9a-z-]+):\s*([^\s#]+)/gm))
      .map(([, key, value]) => ({ key, value: storyStatusSchema.safeParse(value).success ? value : null }))
      .filter((entry): entry is { key: string; value: string } => entry.value !== null)
      .filter(({ value }) => value !== 'done' && !value.startsWith('superseded-by-'))

    const missing = storyKeys.filter(({ key }) => {
      return !artifactNames.has(`test-plan-${key}.md`) && !artifactNames.has(`${key}-tests.md`)
    })

    expect(missing).toEqual([])
  })

  it('0.1-CONTRACT-003 defines role ownership and denies cross-role mutations', () => {
    expect(roleOwnership.manager.owns).toEqual(expect.arrayContaining(['market', 'profile', 'partners']))
    expect(roleOwnership.manager.reads).toEqual(expect.arrayContaining(['farm', 'lots']))
    expect(roleOwnership.officer.owns).toEqual(
      expect.arrayContaining(['farm', 'journal', 'harvest', 'lot', 'qr', 'disease-review'])
    )
    expect(roleOwnership.farmer.owns).toEqual(
      expect.arrayContaining(['household', 'parcels', 'journal', 'diagnosis', 'notifications'])
    )

    expect(canPerformOfficerMutation('officer', 'journal.create')).toBe(true)
    expect(canPerformOfficerMutation('manager', 'journal.create')).toBe(false)
    expect(canPerformOfficerMutation('farmer', 'lot.export-qr')).toBe(false)
    expect(farmerIsolationRules).toHaveLength(3)
  })

  it('0.1-CONTRACT-004 accepts only the canonical response envelopes', () => {
    expect(isSuccessEnvelope({ data: [], meta: { page: 1 } })).toBe(true)
    expect(isSuccessEnvelope({ notifications: [] })).toBe(false)
    expect(isSuccessEnvelope({ success: true })).toBe(false)
    expect(isErrorEnvelope({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })).toBe(true)
    expect(isErrorEnvelope({ error: 'Forbidden' })).toBe(false)
    expect(isErrorEnvelope({ error: { code: 'INVALID' } })).toBe(false)
  })

  it('0.1-ROUTE-001 marks QR public and protects canonical role routes', () => {
    expect(roleCanAccess('/lot/[lot_code]', 'farmer')).toBe(true)
    expect(roleCanAccess('/lot/[lot_code]', 'manager')).toBe(true)
    expect(roleCanAccess('/officer/journal', 'officer')).toBe(true)
    expect(roleCanAccess('/officer/journal', 'manager')).toBe(false)
    expect(roleCanAccess('/manager/lots', 'farmer')).toBe(false)
    expect(canonicalRoutes).toHaveLength(10)

    expect(isPublicResourcePath('/lot/LOT-2026-001')).toBe(true)
    expect(isPublicResourcePath('/htx/HTX-001')).toBe(true)
    expect(isPublicResourcePath('/lottery')).toBe(false)
    expect(isPublicResourcePath('/lot/LOT-001/certificate')).toBe(false)
    expect(isPublicResourcePath('/htx-internal')).toBe(false)

    const middleware = readRepoFile('apps/web/src/middleware.ts')
    expect(middleware).toContain('isPublicResourcePath(pathname)')
    expect(middleware).toContain('lowerPath.startsWith("/manager")')
    expect(middleware).toContain('lowerPath.startsWith("/officer")')
    expect(middleware).toContain('lowerPath.startsWith("/farmer")')
  })

  it('reports canonical pages that are not implemented yet', () => {
    const pageSources: Record<string, string> = {
      '/manager/chat': 'apps/web/src/app/manager/chat/page.tsx',
      '/officer/chat': 'apps/web/src/app/officer/chat/page.tsx',
      '/officer/journal': 'apps/web/src/app/officer/journal/page.tsx',
      '/officer/lots': 'apps/web/src/app/officer/lots/page.tsx',
      '/manager/lots': 'apps/web/src/app/manager/lots/page.tsx',
      '/farmer/bulletin-notifications': 'apps/web/src/app/farmer/bulletin-notifications/page.tsx',
      '/manager/profile': 'apps/web/src/app/manager/profile/page.tsx',
      '/officer/profile': 'apps/web/src/app/officer/profile/page.tsx',
      '/farmer/profile': 'apps/web/src/app/farmer/profile/page.tsx',
      '/lot/[lot_code]': 'apps/web/src/app/lot/[lot_code]/page.tsx',
    }
    const missingRoutes = Object.entries(pageSources)
      .filter(([, source]) => !fs.existsSync(path.join(repoRoot, source)))
      .map(([route]) => route)

    expect(missingRoutes.sort()).toEqual(routeDeviations.map(({ key }) => key).sort())
    expect(routeDeviations.every(({ replacementStory, reason }) => replacementStory && reason)).toBe(true)
  })
})

describe('Story 0.1 schema reconciliation', () => {
  it('0.1-SCHEMA-001 exposes the fields required by the canonical data contract', () => {
    const schema = readRepoFile('apps/web/prisma/schema.prisma')

    const modelBlock = (model: string) => {
      const match = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))
      expect(match).not.toBeNull()
      return match?.[1] ?? ''
    }
    const fieldInModel = (model: string, field: string) =>
      new RegExp(`^\\s*${field}\\s+[^\\s]+`, 'm').test(modelBlock(model))

    const requiredFields: Array<[string, string]> = [
      ['ParcelCropCycle', 'crop'],
      ['ParcelCropCycle', 'planting_date'],
      ['ParcelCropCycle', 'estimated_harvest_date'],
      ['JournalEntry', 'parcel_crop_cycle_id'],
      ['Lot', 'harvest_date'],
      ['Lot', 'packaging_type'],
      ['Lot', 'public_page_data'],
      ['Lot', 'certificate_minio_keys'],
      ['Notification', 'recipient_id'],
      ['Notification', 'deep_link_url'],
      ['Bulletin', 'generated_at'],
    ]

    const missingFields = requiredFields.filter(([model, field]) => !fieldInModel(model, field))
    expect(missingFields).toEqual(schemaDeviations.map(({ key }) => {
      const [model, field] = key.split('.')
      return [model, field]
    }))
  })

  it('preserves n8n ownership in the database contract documentation', () => {
    const docs = readRepoFile('docs/database-schema.md')
    expect(docs).toMatch(/n8n is the ONLY writer/i)
    expect(docs).toMatch(/market_data.*written by n8n/i)
    expect(docs).toMatch(/weather_cache.*written by n8n/i)
    expect(docs).toMatch(/bulletins.*written by n8n/i)
  })
})
