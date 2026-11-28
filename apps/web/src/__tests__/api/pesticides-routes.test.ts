/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import * as pesticides from '@/app/api/pesticides/route'
import * as label from '@/app/api/pesticides/[id]/label/route'
import { PrismaPesticideRepository } from '@/infrastructure/db/pesticide/PrismaPesticideRepository'

type Product = { id: string; trade_name: string; active_ingredient: string; group: string; targets: string[]; default_phi_days: number; phi_needs_label_check: boolean; active: boolean }
const catex: Product = { id: 'catex', trade_name: 'Catex 3.6EC', active_ingredient: 'Abamectin', group: 'CHEMICAL', targets: ['Nhện đỏ'], default_phi_days: 14, phi_needs_label_check: true, active: true }
const biobus: Product = { ...catex, id: 'biobus', trade_name: 'Biobus 1.00WP', group: 'MICROBIAL', targets: ['Chấm xám'], default_phi_days: 7 }

let htx = 'htx-tc'
let role = 'officer'
const labels: { htx_profile_id: string; pesticide_product_id: string; label_phi_days: number; label_note: string | null; verified_at: Date }[] = []
const usage: { pesticide_product_id: string; journal_entry: { entry_date: Date } }[] = []
const advanced: { advanced_on: Date; item: { pesticide_product_id: string | null } }[] = []

jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn(async () => ({ userId: 'u1', role, htxCode: 'X', htxProfileId: htx })) }))
jest.mock('@/application/farm/GetFarmerHouseholdUseCase', () => ({
  GetFarmerHouseholdUseCase: jest.fn(() => ({ execute: jest.fn(async () => ({ id: 'hh1' })) })),
}))
jest.mock('@/infrastructure/db/farm/PrismaHouseholdRepository', () => ({ PrismaHouseholdRepository: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    pesticideProduct: {
      findMany: jest.fn(async () =>
        [catex, biobus].map((p) => ({ ...p, labels: labels.filter((l) => l.pesticide_product_id === p.id && l.htx_profile_id === htx) }))
      ),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const product = [catex, biobus].find((p) => p.id === where.id)
        return product ? { ...product, labels: labels.filter((l) => l.pesticide_product_id === product.id && l.htx_profile_id === htx) } : null
      }),
    },
    htxPesticideLabel: {
      upsert: jest.fn(async ({ create }: { create: { htx_profile_id: string; pesticide_product_id: string; label_phi_days: number; label_note: string | null } }) => {
        const row = { ...create, verified_at: new Date('2026-11-28T00:00:00Z') }
        labels.push(row)
        return row
      }),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    journalActivity: { findMany: jest.fn(async () => usage) },
    inputAdvance: { findMany: jest.fn(async () => advanced) },
  },
}))

const ctx = (id: string) => ({ params: { id } })
const get = (qs = '') => pesticides.GET(new Request(`http://x/api/pesticides${qs}`), {})
const put = (id: string, body: unknown) => label.PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }), ctx(id))
const del = (id: string) => label.DELETE(new Request('http://x', { method: 'DELETE' }), ctx(id))

beforeEach(() => {
  htx = 'htx-tc'
  role = 'officer'
  labels.length = 0
  usage.length = 0
  advanced.length = 0
})

describe('GET /api/pesticides', () => {
  it.each(['farmer', 'officer', 'manager'])('%s reads the catalogue with the effective floor', async (r) => {
    role = r
    const res = await get()
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.map((p: { trade_name: string }) => p.trade_name)).toEqual(['Catex 3.6EC', 'Biobus 1.00WP'])
    expect(data[0]).toMatchObject({ floor_days: 14, default_phi_days: 14, label: null, needs_label_check: true })
  })

  it('filters by name and by target', async () => {
    expect((await (await get('?q=biobus')).json()).data).toHaveLength(1)
    expect((await (await get('?target=nhện')).json()).data[0].id).toBe('catex')
  })

  it('puts the products a farmer household used recently first', async () => {
    role = 'farmer'
    usage.push({ pesticide_product_id: 'biobus', journal_entry: { entry_date: new Date() } })
    const { data } = await (await get()).json()
    expect(data.map((p: { id: string }) => p.id)).toEqual(['biobus', 'catex'])
  })
})

describe('GET /api/pesticides after an advance', () => {
  it('puts a product advanced to the household before one it used', async () => {
    role = 'farmer'
    usage.push({ pesticide_product_id: 'biobus', journal_entry: { entry_date: new Date() } })
    advanced.push({ advanced_on: new Date(), item: { pesticide_product_id: 'catex' } })
    const { data } = await (await get()).json()
    expect(data.map((p: { id: string }) => p.id)).toEqual(['catex', 'biobus'])
  })

  it('ignores an advance whose item has no catalogue product and keeps the used order', async () => {
    role = 'farmer'
    usage.push({ pesticide_product_id: 'biobus', journal_entry: { entry_date: new Date() } })
    advanced.push({ advanced_on: new Date(), item: { pesticide_product_id: null } })
    const { data } = await (await get()).json()
    expect(data.map((p: { id: string }) => p.id)).toEqual(['biobus', 'catex'])
  })

  it('does not look at advances for staff', async () => {
    role = 'manager'
    advanced.push({ advanced_on: new Date(), item: { pesticide_product_id: 'biobus' } })
    const { data } = await (await get()).json()
    expect(data.map((p: { id: string }) => p.id)).toEqual(['catex', 'biobus'])
  })
})

describe('labels', () => {
  it.each(['officer', 'manager'])('%s sets and clears a label', async (r) => {
    role = r
    const res = await put('catex', { label_phi_days: 21, label_note: 'Lô 12' })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ id: 'catex', floor_days: 21, needs_label_check: false, label: { label_phi_days: 21, label_note: 'Lô 12' } })
    const cleared = await del('catex')
    expect(cleared.status).toBe(200)
    expect((await cleared.json()).data).toMatchObject({ floor_days: 14, label: null })
  })

  it('a farmer gets 403 on PUT and DELETE', async () => {
    role = 'farmer'
    expect((await put('catex', { label_phi_days: 20 })).status).toBe(403)
    expect((await del('catex')).status).toBe(403)
  })

  it('a label below the default without a note gives 422, with a note it is stored', async () => {
    const res = await put('catex', { label_phi_days: 5 })
    expect(res.status).toBe(422)
    expect(labels).toHaveLength(0)
    expect((await put('catex', { label_phi_days: 5, label_note: 'Nhãn lô A: 5 ngày' })).status).toBe(200)
  })

  it.each([0, 366, 1.5])('rejects %s days', async (days) => {
    expect((await put('catex', { label_phi_days: days })).status).toBe(400)
  })

  it('answers 404 for an unknown product', async () => {
    expect((await put('nope', { label_phi_days: 20 })).status).toBe(404)
  })

  it("a label is per HTX: TC's label is not visible to LB", async () => {
    await put('catex', { label_phi_days: 21, label_note: 'x' })
    htx = 'htx-lb'
    const { data } = await (await get()).json()
    expect(data[0]).toMatchObject({ id: 'catex', floor_days: 14, label: null })
    expect(await new PrismaPesticideRepository().floorFor('catex', 'htx-lb')).toEqual({ productId: 'catex', floorDays: 14 })
  })
})
