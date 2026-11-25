/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { getAction } from '@/application/agent/action-catalog'
import { PublishBulletinUseCase } from '@/application/bulletin/PublishBulletinUseCase'
import { PrismaBulletinRepository } from '@/infrastructure/db/repositories/PrismaBulletinRepository'

const sources = [{ source: 'FAOSTAT', metric: 'export_price', value: 2.35, unit: 'USD/kg', period: '2026-10' }]
const longText = 'Giá chè xuất khẩu tháng 10 ghi nhận 2,35 USD mỗi kg theo nguồn FAOSTAT, không thay đổi nhiều so với kỳ trước.'

describe('bulletin.publish action', () => {
  const payload = { commodity: 'Tea', period_day: '2026-11-25', bulletin_vi: longText, sources }

  test('refuses a text under 50 characters', () => {
    const schema = getAction('bulletin.publish')!.payloadSchema
    expect(schema.safeParse({ ...payload, bulletin_vi: 'Quá ngắn để đăng.' }).success).toBe(false)
    expect(schema.safeParse({ ...payload, bulletin_vi: 'x'.repeat(49) }).success).toBe(false)
    expect(schema.safeParse({ ...payload, bulletin_vi: 'x'.repeat(50) }).success).toBe(true)
  })

  test('previews the commodity, the day and the first 160 characters', () => {
    const preview = getAction('bulletin.publish')!.preview(payload)
    expect(preview).toEqual([`Đăng bản tin Tea ngày 25/11: ${longText.slice(0, 160)}`])
  })
})

describe('bulletins per cooperative', () => {
  // Fake of the Prisma calls the repository makes; the SQL itself is checked against a real Postgres.
  function fakePrisma() {
    const tx = {
      bulletin: {
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async () => ({ id: 'bulletin-2' })),
      },
    }
    const bulletin = {
      findFirst: jest.fn(async (_args?: unknown): Promise<unknown> => null),
      findMany: jest.fn(async (_args?: unknown): Promise<unknown[]> => []),
    }
    return {
      tx,
      bulletin,
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    }
  }

  test('publish marks the cooperative earlier rows of the commodity not latest, then inserts the new row', async () => {
    const prisma = fakePrisma()
    const repo = new PrismaBulletinRepository(prisma as never)

    const result = await new PublishBulletinUseCase(repo).execute('TC', {
      commodity: 'Tea',
      bulletinVi: longText,
      sources,
      modelUsed: 'agent:bulletin',
    })

    expect(result).toEqual({ id: 'bulletin-2' })
    expect(prisma.tx.bulletin.updateMany).toHaveBeenCalledWith({
      where: { htx_code: 'TC', commodity: 'Tea', is_latest: true },
      data: { is_latest: false },
    })
    expect(prisma.tx.bulletin.create).toHaveBeenCalledWith({
      data: {
        commodity: 'Tea',
        bulletin_vi: longText,
        sources_json: sources,
        model_used: 'agent:bulletin',
        is_latest: true,
        status: 'published',
        htx_code: 'TC',
      },
      select: { id: true },
    })
    expect(prisma.tx.bulletin.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.tx.bulletin.create.mock.invocationCallOrder[0]
    )
  })

  test('readers only see published rows of their cooperative or shared rows', async () => {
    const prisma = fakePrisma()
    const repo = new PrismaBulletinRepository(prisma as never)
    const visible = { status: 'published', OR: [{ htx_code: 'TC' }, { htx_code: null }] }

    await repo.getLatestBulletin('Tea', 'TC')
    expect(prisma.bulletin.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ commodity: 'Tea', is_latest: true, ...visible }) })
    )

    await repo.getAllLatestBulletins('TC')
    expect(prisma.bulletin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ is_latest: true, ...visible }) })
    )
  })

  test('the all-bulletins reader keeps the cooperative row over the shared one for a commodity', async () => {
    const prisma = fakePrisma()
    const shared = { id: 'shared-1', commodity: 'Tea', bulletin_vi: 'Bản tin chung', sources_json: [], model_used: 'n8n', is_latest: true, htx_code: null, created_at: new Date('2026-11-25T05:00:00Z') }
    const own = { ...shared, id: 'tc-1', bulletin_vi: 'Bản tin TC', model_used: 'agent:bulletin', htx_code: 'TC', created_at: new Date('2026-11-25T04:00:00Z') }
    // The database orders the cooperative row first (nulls last); the reader keeps the first row per commodity.
    prisma.bulletin.findMany.mockResolvedValueOnce([own, shared])
    const repo = new PrismaBulletinRepository(prisma as never)

    const rows = await repo.getAllLatestBulletins('TC')

    expect(rows.map((r) => r.id)).toEqual(['tc-1'])
  })
})
