/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GET as getOutbox } from '@/app/api/internal/zalo/outbox/route'
import { POST as postResult } from '@/app/api/internal/zalo/outbox/[id]/result/route'
import { POST as postTick } from '@/app/api/internal/zalo/tick/route'
import { POST as postHeartbeat } from '@/app/api/internal/zalo/heartbeat/route'
import { GET as getCredentials, POST as postCredentials } from '@/app/api/internal/zalo/credentials/route'
import { GET as getSettings, PUT as putSettings } from '@/app/api/zalo/settings/route'
import { GET as getDeliveries } from '@/app/api/zalo/deliveries/route'
import { GET as getConsent, POST as postConsent } from '@/app/api/households/[id]/zalo-consent/route'
import { GET as getTemplates, PUT as putTemplates } from '@/app/api/platform/zalo/templates/route'
import { GET as getAdminCredentials, PUT as putAdminCredentials } from '@/app/api/platform/zalo/credentials/route'
import { requireZaloCaller } from '@/lib/api/internal-zalo-auth'
import { requireTenant } from '@/lib/api/tenant'
import { requirePlatformAdmin } from '@/lib/api/platform'
import { ForbiddenError } from '@/domain/errors'
import { FakeZaloRepository, ON, seedHousehold, TEMPLATES } from '../../../../__tests__/__mocks__/zalo-fakes'

const mockState: { repo: FakeZaloRepository; scanned: number } = { repo: new FakeZaloRepository(), scanned: 0 }

jest.mock('@/lib/api/internal-zalo-auth', () => ({ requireZaloCaller: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/lib/api/platform', () => ({ requirePlatformAdmin: jest.fn() }))
jest.mock('@/application/zalo/zalo-services', () => {
  const { ZaloNotifier } = jest.requireActual('@/application/zalo/ZaloNotifier')
  const { RecordZaloConsentUseCase } = jest.requireActual('@/application/zalo/ZaloConsentUseCases')
  const { ZaloCredentialService } = jest.requireActual('@/application/zalo/ZaloCredentialService')
  const { encryptToken, decryptToken } = jest.requireActual('@/infrastructure/crypto/zalo-token-cipher')
  return {
    zaloRepository: () => mockState.repo,
    zaloConsents: () => new RecordZaloConsentUseCase(mockState.repo),
    zaloNotifier: () => new ZaloNotifier(mockState.repo),
    zaloCredentials: () => new ZaloCredentialService(mockState.repo, { encrypt: encryptToken, decrypt: decryptToken }),
    withdrawalEndedScan: () => ({ run: async () => { mockState.scanned += 1; return 3 } }),
  }
})

const json = (url: string, method: string, body?: unknown) => new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const signIn = (role: string, userId = `${role}-1`) => (requireTenant as jest.Mock).mockResolvedValue({ userId, role, htxCode: 'TC', htxProfileId: 'htx-tc' })
const ID = '00000000-0000-4000-8000-0000000000aa'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.DXOS_ZALO_TOKEN_KEY = 'b'.repeat(64)
  mockState.repo = new FakeZaloRepository()
  mockState.scanned = 0
  mockState.repo.settingsByHtx.set('TC', ON)
  mockState.repo.templateList = TEMPLATES
  seedHousehold(mockState.repo, 'hh-1', '0912345678', 'TC', true)
  ;(requireZaloCaller as jest.Mock).mockResolvedValue({ sub: 'sa', azp: 'dxos-zalo', roles: ['zalo'] })
  ;(requirePlatformAdmin as jest.Mock).mockResolvedValue({ userId: 'admin-1' })
})

describe('internal relay routes', () => {
  it('refuse a caller that fails the gateway or token check, and touch nothing', async () => {
    ;(requireZaloCaller as jest.Mock).mockRejectedValue(new ForbiddenError('INTERNAL_GATEWAY_REQUIRED'))
    const calls = [
      getOutbox(json('http://x/outbox', 'GET'), undefined),
      postResult(json('http://x/r', 'POST', { ok: true }), ctx(ID)),
      postTick(json('http://x/tick', 'POST'), undefined),
      postHeartbeat(json('http://x/hb', 'POST', {}), undefined),
      getCredentials(json('http://x/c', 'GET'), undefined),
      postCredentials(json('http://x/c', 'POST', { access_token: 'a', refresh_token: 'b', expires_at: '2026-12-01T00:00:00Z' }), undefined),
    ]
    expect((await Promise.all(calls)).map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403])
    expect(mockState.scanned).toBe(0)
    expect(mockState.repo.stored).toBeNull()
  })

  it('GET /outbox leases rows in the relay shape and honours limit (max 50)', async () => {
    await mockState.repo.insertOutbox([{ htxCode: 'TC', eventKind: 'TICKET_RECEIPT', eventId: 't', householdId: 'hh-1', phone: '84912345678', templateKey: 'ticket_receipt', params: { ticket_no: 'X' }, status: 'pending', lastError: null, nextAttemptAt: new Date(0) }])
    const res = await getOutbox(json('http://x/outbox?limit=500', 'GET'), undefined)
    expect(await res.json()).toEqual({ data: [{ id: 'row-1', phone: '84912345678', zns_template_id: '222', template_data: { ticket_no: 'X' }, tracking_id: 'row-1' }] })
  })

  it('POST /outbox/{id}/result answers the status, 400 for a bad body, 404 for an unknown row', async () => {
    await mockState.repo.insertOutbox([{ htxCode: 'TC', eventKind: 'TICKET_RECEIPT', eventId: 't', householdId: 'hh-1', phone: '84912345678', templateKey: 'ticket_receipt', params: {}, status: 'pending', lastError: null, nextAttemptAt: new Date(0) }])
    await getOutbox(json('http://x/outbox', 'GET'), undefined)
    const rowId = '00000000-0000-4000-8000-000000000001'
    mockState.repo.rows[0].id = rowId
    expect((await postResult(json('http://x/r', 'POST', { ok: 'yes' }), ctx(rowId))).status).toBe(400)
    const retry = await postResult(json('http://x/r', 'POST', { ok: false, error: 'http 500', retry_after_seconds: 30 }), ctx(rowId))
    expect(await retry.json()).toEqual({ data: { status: 'pending' } })
    mockState.repo.rows[0].status = 'leased'
    const sent = await postResult(json('http://x/r', 'POST', { ok: true, zalo_msg_id: 'm1' }), ctx(rowId))
    expect(await sent.json()).toEqual({ data: { status: 'sent' } })
    expect((await postResult(json('http://x/r', 'POST', { ok: true }), ctx(ID))).status).toBe(404)
    expect((await postResult(json('http://x/r', 'POST', { ok: true }), ctx('not-a-uuid'))).status).toBe(400)
  })

  it('POST /tick runs the withdrawal scan and answers how many were queued', async () => {
    const res = await postTick(json('http://x/tick', 'POST'), undefined)
    expect(await res.json()).toEqual({ data: { queued: 3 } })
    expect(mockState.scanned).toBe(1)
  })

  it('POST /heartbeat records the beat', async () => {
    const res = await postHeartbeat(json('http://x/hb', 'POST', { version: '1.22.0' }), undefined)
    expect(await res.json()).toEqual({ data: { ok: true } })
    expect(mockState.repo.heartbeats).toBe(1)
  })

  it('credentials: null before any are stored, then the relay stores refreshed tokens and reads them back', async () => {
    expect(await (await getCredentials(json('http://x/c', 'GET'), undefined)).json()).toEqual({ data: null })
    const body = { access_token: 'acc-1', refresh_token: 'ref-1', expires_at: '2026-12-01T00:00:00.000Z' }
    expect((await postCredentials(json('http://x/c', 'POST', body), undefined)).status).toBe(200)
    expect(JSON.stringify(mockState.repo.stored)).not.toMatch(/acc-1|ref-1/)
    expect(await (await getCredentials(json('http://x/c', 'GET'), undefined)).json()).toEqual({ data: body })
    expect((await postCredentials(json('http://x/c', 'POST', { access_token: 'x' }), undefined)).status).toBe(400)
  })

  it('refuses to store tokens without DXOS_ZALO_TOKEN_KEY', async () => {
    delete process.env.DXOS_ZALO_TOKEN_KEY
    const res = await postCredentials(json('http://x/c', 'POST', { access_token: 'a', refresh_token: 'b', expires_at: '2026-12-01T00:00:00Z' }), undefined)
    expect(res.status).toBe(500)
    expect(mockState.repo.stored).toBeNull()
  })
})

describe('cooperative settings and deliveries', () => {
  it('lets only a manager read and change the settings', async () => {
    signIn('officer')
    expect((await getSettings(json('http://x/s', 'GET'), undefined)).status).toBe(403)
    signIn('manager')
    const body = { enabled: true, kinds: ['PRICE_PUBLISHED'], quiet_start_hour: 22, quiet_end_hour: 5, monthly_quota: 500 }
    expect((await putSettings(json('http://x/s', 'PUT', body), undefined)).status).toBe(200)
    expect(mockState.repo.settingsByHtx.get('TC')).toEqual({ enabled: true, kinds: ['PRICE_PUBLISHED'], quietStartHour: 22, quietEndHour: 5, monthlyQuota: 500 })
    const read = (await (await getSettings(json('http://x/s', 'GET'), undefined)).json()).data
    expect(read).toMatchObject({ enabled: true, kinds: ['PRICE_PUBLISHED'], quiet_start_hour: 22, monthly_quota: 500, sent_this_month: 0 })
  })

  it('rejects an unknown kind, quiet hours that do not wrap midnight and an extra field', async () => {
    signIn('manager')
    const ok = { enabled: true, kinds: ['PRICE_PUBLISHED'], quiet_start_hour: 21, quiet_end_hour: 6, monthly_quota: 100 }
    for (const bad of [{ ...ok, kinds: ['FREE_TEXT'] }, { ...ok, quiet_start_hour: 5, quiet_end_hour: 9 }, { ...ok, extra: 1 }, { ...ok, monthly_quota: -1 }]) {
      expect((await putSettings(json('http://x/s', 'PUT', bad), undefined)).status).toBe(400)
    }
    expect(mockState.repo.settingsByHtx.get('TC')).toEqual(ON)
  })

  it('lists deliveries for a manager and an accountant with masked phones and the reason in Vietnamese', async () => {
    await mockState.repo.insertOutbox([
      { htxCode: 'TC', eventKind: 'TICKET_RECEIPT', eventId: 't1', householdId: 'hh-1', phone: '84912345678', templateKey: 'ticket_receipt', params: {}, status: 'skipped', lastError: 'NO_CONSENT', nextAttemptAt: new Date() },
      { htxCode: 'TC', eventKind: 'PRICE_PUBLISHED', eventId: 'p1', householdId: 'hh-1', phone: '84912345678', templateKey: 'price_today', params: {}, status: 'pending', lastError: null, nextAttemptAt: new Date() },
      { htxCode: 'OTHER', eventKind: 'PRICE_PUBLISHED', eventId: 'p2', householdId: 'hh-9', phone: '84900000000', templateKey: 'price_today', params: {}, status: 'pending', lastError: null, nextAttemptAt: new Date() },
    ])
    mockState.repo.rows[0].status = 'failed'
    mockState.repo.rows[0].lastError = '-108 Số điện thoại không hợp lệ' // the relay's "<code> <description>"
    for (const role of ['manager', 'accountant']) {
      signIn(role)
      const { data } = await (await getDeliveries(json('http://x/d', 'GET'), undefined)).json()
      expect(data).toHaveLength(2)
      expect(JSON.stringify(data)).not.toMatch(/84912345678|0912345678/)
      expect(data.find((d: { kind: string }) => d.kind === 'TICKET_RECEIPT')).toMatchObject({ phone_masked: '***678', status: 'failed', reason_vi: 'Số điện thoại của hộ không hợp lệ.' })
    }
    const filtered = await (await getDeliveries(json('http://x/d?status=pending&kind=PRICE_PUBLISHED', 'GET'), undefined)).json()
    expect(filtered.data.map((d: { kind: string }) => d.kind)).toEqual(['PRICE_PUBLISHED'])
    expect((await getDeliveries(json('http://x/d?status=bogus', 'GET'), undefined)).status).toBe(400)
    signIn('officer')
    expect((await getDeliveries(json('http://x/d', 'GET'), undefined)).status).toBe(403)
    signIn('farmer')
    expect((await getDeliveries(json('http://x/d', 'GET'), undefined)).status).toBe(403)
  })
})

describe('household consent route', () => {
  it('records for staff and for the farmer opting out of their own household, and refuses the rest', async () => {
    mockState.repo.keycloakIds.set('hh-1', 'kc-1')
    signIn('officer')
    expect((await postConsent(json('http://x/c', 'POST', { status: 'OPTED_IN', source: 'OFFICER' }), ctx('hh-1'))).status).toBe(200)
    signIn('farmer', 'kc-1')
    expect((await postConsent(json('http://x/c', 'POST', { status: 'OPTED_OUT', source: 'MEMBER' }), ctx('hh-1'))).status).toBe(200)
    expect((await getConsent(json('http://x/c', 'GET'), ctx('hh-1'))).status).toBe(200)
    expect(mockState.repo.consents.map((c) => [c.state.status, c.recordedBy])).toEqual([['OPTED_IN', 'officer-1'], ['OPTED_IN', 'officer-1'], ['OPTED_OUT', 'kc-1']])
    expect((await postConsent(json('http://x/c', 'POST', { status: 'OPTED_IN', source: 'MEMBER' }), ctx('hh-1'))).status).toBe(403)
    signIn('farmer', 'kc-2')
    expect((await postConsent(json('http://x/c', 'POST', { status: 'OPTED_OUT', source: 'MEMBER' }), ctx('hh-1'))).status).toBe(403)
    expect((await postConsent(json('http://x/c', 'POST', { status: 'MAYBE', source: 'MEMBER' }), ctx('hh-1'))).status).toBe(400)
  })
})

describe('platform admin routes', () => {
  it('refuses anyone but the platform admin', async () => {
    ;(requirePlatformAdmin as jest.Mock).mockRejectedValue(new ForbiddenError('Forbidden'))
    const t = await putTemplates(json('http://x/t', 'PUT', { templates: [] }), undefined)
    const c = await putAdminCredentials(json('http://x/c', 'PUT', { access_token: 'a', refresh_token: 'b', expires_at: '2026-12-01T00:00:00Z' }), undefined)
    expect([t.status, c.status]).toEqual([403, 403])
    expect(mockState.repo.stored).toBeNull()
  })

  it('stores templates, shows all four keys, and refuses a parameter a template may not carry', async () => {
    mockState.repo.templateList = []
    const ok = { templates: [{ template_key: 'withdrawal_ended', zns_template_id: '123456', params: ['parcel_code', 'safe_date'] }] }
    expect((await putTemplates(json('http://x/t', 'PUT', ok), undefined)).status).toBe(200)
    const { data } = await (await getTemplates(json('http://x/t', 'GET'), undefined)).json()
    expect(data.map((t: { template_key: string; configured: boolean }) => [t.template_key, t.configured])).toEqual([['price_today', false], ['ticket_receipt', false], ['withdrawal_ended', true], ['settlement_closed', false]])
    for (const bad of [
      { template_key: 'withdrawal_ended', zns_template_id: '1', params: ['bank_account'] },
      { template_key: 'withdrawal_ended', zns_template_id: '1', params: ['pesticide_name'] },
      { template_key: 'ticket_receipt', zns_template_id: '1', params: ['parcel_code'] },
      { template_key: 'free_text', zns_template_id: '1', params: [] },
      { template_key: 'price_today', zns_template_id: '', params: [] },
    ]) {
      expect((await putTemplates(json('http://x/t', 'PUT', { templates: [bad] }), undefined)).status).toBe(400)
    }
    expect(mockState.repo.templateList).toHaveLength(1)
  })

  it('stores the OA tokens encrypted and shows only the last 4 characters afterwards', async () => {
    const body = { access_token: 'oa-access-WXYZ', refresh_token: 'oa-refresh-secret', expires_at: '2026-12-01T00:00:00.000Z' }
    const put = await putAdminCredentials(json('http://x/c', 'PUT', body), undefined)
    expect(put.status).toBe(200)
    expect(JSON.stringify(await put.json())).not.toMatch(/oa-access|oa-refresh/)
    const get = await (await getAdminCredentials(json('http://x/c', 'GET'), undefined)).json()
    expect(get.data).toMatchObject({ configured: true, access_token_last4: 'WXYZ' })
    expect(JSON.stringify(get)).not.toMatch(/oa-refresh|oa-access/)
    expect(JSON.stringify(mockState.repo.stored)).not.toMatch(/oa-access|oa-refresh/)
  })
})
