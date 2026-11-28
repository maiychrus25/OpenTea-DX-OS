/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Runs against a throwaway Postgres with platform/postgres/init/01-03 and 10-zalo.sql, then every migration, and only when
// ZALO_TEST_DATABASE_URL is set:
//   ZALO_TEST_DATABASE_URL=postgresql://... npx jest src/__tests__/db/zalo-postgres.integration.test.ts
// It never runs in the normal suite, which has no database.

const zaloDatabaseUrl = process.env.ZALO_TEST_DATABASE_URL
const maybeZalo = zaloDatabaseUrl ? describe : describe.skip

maybeZalo('Zalo channel on a real Postgres', () => {
  let prisma: import('@prisma/client').PrismaClient
  let repo: import('@/infrastructure/db/zalo/PrismaZaloRepository').PrismaZaloRepository
  let notifier: import('@/application/zalo/ZaloNotifier').ZaloNotifier

  const run = String(Date.now())
  const htxCode = `Z${run.slice(-5)}`
  let htxId = ''
  const ids: string[] = []
  const phones = [0, 1, 2].map((i) => `09${run.slice(-7)}${i}`)

  beforeAll(async () => {
    process.env.DATABASE_URL = zaloDatabaseUrl
    ;({ prisma } = require('@/infrastructure/db/prisma.client'))
    repo = new (require('@/infrastructure/db/zalo/PrismaZaloRepository').PrismaZaloRepository)()
    const { ZaloNotifier } = require('@/application/zalo/ZaloNotifier')
    notifier = new ZaloNotifier(repo, () => new Date('2026-11-28T05:00:00Z'))
    htxId = (await prisma.htxProfile.create({ data: { name: 'HTX Zalo', address: 'x', crop_types: [], htx_code: htxCode } })).id
    for (let i = 0; i < phones.length; i++) {
      ids.push((await prisma.household.create({ data: { name: `Hộ ${i}`, phone: phones[i], htx_profile_id: htxId } })).id)
    }
    await repo.saveSettings(htxCode, { enabled: true, kinds: ['TICKET_RECEIPT', 'PRICE_PUBLISHED'], quietStartHour: 21, quietEndHour: 6, monthlyQuota: 2000 }, 'admin')
    await repo.saveTemplates([
      { templateKey: 'ticket_receipt', znsTemplateId: 'T1', params: ['ticket_no', 'net_kg'] },
      { templateKey: 'price_today', znsTemplateId: 'T2', params: ['customer_name', 'date', 'price_list'] },
    ], 'admin')
  })

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM platform.zalo_outbox WHERE htx_code = ${htxCode}`
    await prisma.$disconnect()
  })

  const opt = (i: number, status: 'OPTED_IN' | 'OPTED_OUT', source: 'OFFICER' | 'MEMBER' = 'OFFICER') =>
    repo.recordConsent({ htxCode, householdId: ids[i], phone: `84${phones[i].slice(1)}`, status, source, recordedBy: 'officer-1' })
  const receipt = (eventId: string, i = 0) => ({ kind: 'TICKET_RECEIPT' as const, htxCode, eventId, householdId: ids[i], params: { ticket_no: 'X-1', net_kg: '5' } })

  it('queues for an opted-in household only, once per event, and lists it as a delivery', async () => {
    await opt(0, 'OPTED_IN')
    expect(await notifier.enqueue(receipt('t1'))).toEqual({ queued: 1, skipped: 0 })
    expect(await notifier.enqueue(receipt('t1'))).toEqual({ queued: 0, skipped: 0 })
    expect(await notifier.enqueue(receipt('t2', 1))).toEqual({ queued: 0, skipped: 1 })
    const rows = await repo.deliveries(htxCode, { limit: 10 })
    expect(rows.map((r) => [r.eventId, r.status, r.lastError]).sort()).toEqual([['t1', 'pending', null], ['t2', 'skipped', 'NO_CONSENT']])
    expect((await repo.deliveries(htxCode, { limit: 10, status: 'skipped' })).map((r) => r.eventId)).toEqual(['t2'])
  })

  it('takes the newest consent: the price message reaches only the households whose latest row is OPTED_IN', async () => {
    await opt(1, 'OPTED_IN')
    await opt(1, 'OPTED_OUT', 'MEMBER')
    await opt(2, 'OPTED_IN')
    const result = await notifier.enqueue({ kind: 'PRICE_PUBLISHED', htxCode, eventId: `${htxCode}:2026-11-28:h`, householdId: null, params: { date: '28/11/2026', price_list: 'Loại 1: 9.000' } })
    expect(result).toEqual({ queued: 2, skipped: 1 })
    const consents = await repo.latestConsents(ids)
    expect(consents.get(ids[1])).toMatchObject({ status: 'OPTED_OUT', source: 'MEMBER' })
  })

  it('leases with SKIP LOCKED, re-checks consent, and records the result', async () => {
    await opt(0, 'OPTED_OUT', 'MEMBER')
    const leased = await notifier.lease(50)
    // Household 0 opted out after both its rows were queued, so t1 and its price row are skipped; only household 2 goes out.
    expect(leased.map((m) => m.zns_template_id)).toEqual(['T2'])
    const all = await repo.deliveries(htxCode, { limit: 20 })
    expect(all.filter((r) => r.householdId === ids[0]).map((r) => [r.status, r.lastError])).toEqual([['skipped', 'CONSENT_REVOKED'], ['skipped', 'CONSENT_REVOKED']])
    expect(await notifier.lease(50)).toEqual([])
    expect(await notifier.recordResult(leased[0].id, { ok: true, zalo_msg_id: 'm-1' })).toBe('sent')

    await notifier.enqueue(receipt('t3', 2))
    const second = await notifier.lease(50)
    expect(second).toHaveLength(1)
    expect(await notifier.recordResult(second[0].id, { ok: false, error: 'Zalo -108', permanent: true })).toBe('failed')
    expect((await repo.deliveries(htxCode, { limit: 20, status: 'failed' }))[0]).toMatchObject({ eventId: 't3', lastError: 'Zalo -108', attempts: 1 })
  })

  it('keeps consents append-only and never lets one cooperative read another', async () => {
    await expect(prisma.$executeRaw`UPDATE platform.zalo_consents SET status = 'OPTED_IN' WHERE household_id = ${ids[0]}`).rejects.toThrow()
    await expect(prisma.$executeRaw`DELETE FROM platform.zalo_consents WHERE household_id = ${ids[0]}`).rejects.toThrow()
    expect(await repo.recipients('NOPE', null)).toEqual([])
    expect(await repo.recipients('NOPE', ids[0])).toEqual([])
    expect((await repo.recipients(htxCode, ids[0])).map((r) => r.id)).toEqual([ids[0]])
  })

  it('stores the OA credentials as one row', async () => {
    await repo.saveCredentials({ accessTokenEnc: 'v1:a:b:c', refreshTokenEnc: 'v1:d:e:f', expiresAt: new Date('2026-12-01T00:00:00Z') }, 'admin')
    await repo.saveCredentials({ accessTokenEnc: 'v1:g:h:i', refreshTokenEnc: 'v1:j:k:l', expiresAt: new Date('2026-12-02T00:00:00Z') }, 'admin')
    expect(await repo.credentials()).toMatchObject({ accessTokenEnc: 'v1:g:h:i' })
    expect(await prisma.$queryRaw`SELECT count(*)::int AS n FROM platform.zalo_credentials`).toEqual([{ n: 1 }])
  })
})
