/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Runs against a throwaway Postgres with platform/postgres/init/01-03 and then every migration, and only when
// DISEASE_TEST_DATABASE_URL is set:
//   DISEASE_TEST_DATABASE_URL=postgresql://... npx jest src/__tests__/db/disease-labels-postgres.integration.test.ts
// It never runs in the normal suite, which has no database.

import { readFileSync } from 'fs'
import { join } from 'path'

const diseaseUrl = process.env.DISEASE_TEST_DATABASE_URL
const maybeDisease = diseaseUrl ? describe : describe.skip

maybeDisease('disease labels, consent and the training manifest on a real Postgres', () => {
  let prisma: import('@prisma/client').PrismaClient
  let reports: import('@/infrastructure/db/farm/PrismaDiseaseReportRepository').PrismaDiseaseReportRepository
  let labels: import('@/infrastructure/db/farm/PrismaDiseaseLabelRepository').PrismaDiseaseLabelRepository
  let consent: import('@/infrastructure/db/farm/PrismaDiseaseConsentRepository').PrismaDiseaseConsentRepository
  let dataset: import('@/infrastructure/db/farm/PrismaDiseaseDatasetRepository').PrismaDiseaseDatasetRepository

  const run = String(Date.now())
  const sites = {
    yes: { code: `Y${run.slice(-5)}`, phone: `09${run.slice(-8)}`, htx: '', parcel: '', hh: '' },
    no: { code: `N${run.slice(-5)}`, phone: `08${run.slice(-8)}`, htx: '', parcel: '', hh: '' },
  }
  const report = (site: typeof sites.yes, data: { status?: 'PENDING' | 'CONFIRMED' | 'REJECTED'; label?: string | null; key?: string; confirmedAt?: Date; diagnosis?: string | null } = {}) =>
    prisma.diseaseReport.create({
      data: {
        parcel_id: site.parcel, household_id: site.hh, detected_by_id: 'farmer-1', detection_date: new Date(), photo_url: 'u', photo_minio_key: data.key ?? 'k',
        ai_disease_name: 'x', ai_confidence: 0.5, status: data.status ?? 'CONFIRMED', confirmed_label_code: data.label === undefined ? 'helopeltis' : data.label,
        confirmed_diagnosis: data.diagnosis ?? null, confirmed_at: data.confirmedAt ?? new Date('2026-11-20T08:00:00Z'),
      },
    })

  beforeAll(async () => {
    process.env.DATABASE_URL = diseaseUrl
    ;({ prisma } = require('@/infrastructure/db/prisma.client'))
    reports = new (require('@/infrastructure/db/farm/PrismaDiseaseReportRepository').PrismaDiseaseReportRepository)()
    labels = new (require('@/infrastructure/db/farm/PrismaDiseaseLabelRepository').PrismaDiseaseLabelRepository)()
    consent = new (require('@/infrastructure/db/farm/PrismaDiseaseConsentRepository').PrismaDiseaseConsentRepository)()
    dataset = new (require('@/infrastructure/db/farm/PrismaDiseaseDatasetRepository').PrismaDiseaseDatasetRepository)()
    for (const site of Object.values(sites)) {
      site.htx = (await prisma.htxProfile.create({ data: { name: `HTX ${site.code}`, address: 'x', crop_types: [], htx_code: site.code } })).id
      site.hh = (await prisma.household.create({ data: { name: `Hộ ${site.code}`, phone: site.phone, htx_profile_id: site.htx } })).id
      site.parcel = (await prisma.parcel.create({ data: { parcel_code: `P-${site.code}`, household_id: site.hh, crop_type: 'Chè', area_ha: 1, status: 'TENDING' } })).id
    }
  })

  afterAll(async () => { await prisma.$disconnect() })

  it('seeds the label list with the five targets first', async () => {
    const list = await labels.list()
    expect(list).toHaveLength(14)
    expect(list.slice(0, 5).map((l) => l.code)).toEqual(['green_leafhopper', 'tea_thrips', 'red_spider_mite', 'blister_blight', 'helopeltis'])
    expect(list.slice(0, 5).every((l) => l.is_target)).toBe(true)
    expect(await labels.exists('not_tea_leaf')).toBe(true)
    expect(await labels.exists('nope')).toBe(false)
  })

  it('refuses a report label that is not in the list', async () => {
    await expect(report(sites.yes, { label: 'nope' })).rejects.toThrow()
  })

  it('stores the confirmed label and the model version with the review', async () => {
    const pending = await report(sites.yes, { status: 'PENDING', label: null })
    await reports.updateStatus(pending.id, 'CONFIRMED', 'Cắt', 'officer-1', 'Bọ xít muỗi', undefined, 'helopeltis')
    const row = await prisma.diseaseReport.findUniqueOrThrow({ where: { id: pending.id } })
    expect(row).toMatchObject({ status: 'CONFIRMED', confirmed_label_code: 'helopeltis', confirmed_diagnosis: 'Bọ xít muỗi' })

    const saved = await reports.save({ parcel_id: sites.yes.parcel, household_id: sites.yes.hh, detected_by_id: 'farmer-1', detection_date: new Date(), photo_url: 'u', photo_minio_key: 'k', ai_disease_name: 'x', ai_confidence: 0.9, model_version: 'tea-2026.11.0' })
    expect((await prisma.diseaseReport.findUniqueOrThrow({ where: { id: saved.id } })).model_version).toBe('tea-2026.11.0')
  })

  it('backfills an old confirmed report only on an exact name match', async () => {
    const sql = readFileSync(join(__dirname, '..', '..', '..', 'prisma', 'migrations', '20261128180000_disease_labels', 'migration.sql'), 'utf8')
    const backfill = sql.match(/UPDATE "disease_reports"[\s\S]*?;/)![0]
    const exact = await report(sites.no, { label: null, diagnosis: 'Bọ xít muỗi' })
    const near = await report(sites.no, { label: null, diagnosis: 'bọ xít muỗi ' })
    const pending = await report(sites.no, { status: 'PENDING', label: null, diagnosis: 'Bọ xít muỗi' })

    await prisma.$executeRawUnsafe(backfill)

    const code = async (id: string) => (await prisma.diseaseReport.findUniqueOrThrow({ where: { id } })).confirmed_label_code
    expect(await code(exact.id)).toBe('helopeltis')
    expect(await code(near.id)).toBeNull()
    expect(await code(pending.id)).toBeNull()
  })

  it('keeps consent off by default, and a switch names the person in the audit trail', async () => {
    expect(await consent.get(sites.yes.htx)).toEqual({ enabled: false, at: null, by: null })

    const on = await consent.set(sites.yes.htx, 'manager-1', true)
    expect(on).toMatchObject({ enabled: true, by: 'manager-1' })
    expect(on.at).toEqual(expect.any(String))
    const audited = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM audit.events WHERE table_name = 'htx_profiles' AND row_id = ${sites.yes.htx} AND op = 'UPDATE' AND actor = 'user:manager-1'`
    expect(audited[0].n).toBeGreaterThan(0)
  })

  it('lists only confirmed, labelled photos of consenting cooperatives: a cooperative that never opted in gives zero rows', async () => {
    const confirmed = await report(sites.yes, { key: 'yes/ok.jpg', confirmedAt: new Date('2026-11-21T08:00:00Z') })
    await report(sites.yes, { key: 'yes/old.jpg', confirmedAt: new Date('2026-11-10T08:00:00Z') })
    await report(sites.yes, { status: 'PENDING', label: null, key: 'yes/pending.jpg' })
    await report(sites.yes, { status: 'REJECTED', label: null, key: 'yes/rejected.jpg' })
    await report(sites.yes, { label: null, key: 'yes/unlabelled.jpg' })
    await report(sites.yes, { key: '' })
    await report(sites.no, { key: 'no/ok.jpg' })

    const all = await dataset.findConsented({ limit: 500 })
    expect(all.some((r) => r.htx_code === sites.no.code)).toBe(false)
    expect(await dataset.findConsented({ htxCode: sites.no.code, limit: 500 })).toEqual([])
    const mine = await dataset.findConsented({ htxCode: sites.yes.code, limit: 500 })
    expect(mine.map((r) => r.photo_minio_key).sort()).toEqual(['k', 'yes/ok.jpg', 'yes/old.jpg'])
    expect(mine.find((r) => r.report_id === confirmed.id)).toMatchObject({ label_code: 'helopeltis', htx_code: sites.yes.code })
    expect(Object.keys(mine[0]).sort()).toEqual(['confirmed_at', 'htx_code', 'label_code', 'photo_minio_key', 'report_id'])
  })

  it('honours since and limit, oldest first', async () => {
    const after = await dataset.findConsented({ htxCode: sites.yes.code, since: new Date('2026-11-20T12:00:00Z'), limit: 500 })
    expect(after.map((r) => r.photo_minio_key)).toEqual(['yes/ok.jpg', 'k'])
    expect((await dataset.findConsented({ htxCode: sites.yes.code, limit: 500 }))[0].photo_minio_key).toBe('yes/old.jpg')
    expect(await dataset.findConsented({ htxCode: sites.yes.code, limit: 1 })).toHaveLength(1)
  })

  it('stops contributing the moment the head switches consent off', async () => {
    expect((await consent.set(sites.yes.htx, 'manager-1', false)).enabled).toBe(false)
    expect(await dataset.findConsented({ htxCode: sites.yes.code, limit: 500 })).toEqual([])
  })
})
