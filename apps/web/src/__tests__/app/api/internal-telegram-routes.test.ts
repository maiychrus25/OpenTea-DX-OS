/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { POST as postUpdate } from '@/app/api/internal/telegram/updates/route'
import { GET as getOutbox } from '@/app/api/internal/telegram/outbox/route'
import { POST as postResult } from '@/app/api/internal/telegram/outbox/[id]/result/route'
import { POST as postAgentReport } from '@/app/api/internal/agent/reports/route'
import { requireTelegramCaller } from '@/lib/api/internal-telegram-auth'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'

const handle = jest.fn()
const recordResult = jest.fn()
const runHealthChecks = jest.fn()
const lease = jest.fn()
const enqueueReport = jest.fn()

jest.mock('@/lib/api/internal-telegram-auth', () => ({ requireTelegramCaller: jest.fn() }))
jest.mock('@/lib/api/internal-agent-auth', () => ({ requireAgentCaller: jest.fn() }))
jest.mock('@/application/telegram/telegram-services', () => ({
  telegramUpdateHandler: () => ({ handle }),
  telegramNotifier: () => ({ recordResult, runHealthChecks, enqueueReport }),
  telegramRepository: () => ({ lease }),
}))

const RESULT_ID = '00000000-0000-4000-8000-0000000000cc'

describe('Internal Telegram and agent report routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requireTelegramCaller as jest.Mock).mockResolvedValue({ sub: 'sa', azp: 'dxos-telegram', roles: ['telegram'] })
    ;(requireAgentCaller as jest.Mock).mockResolvedValue({ sub: 'sa', azp: 'dxos-agent-tc', htxCode: 'TC', roles: ['agent'] })
  })

  test('POST /updates returns the handler answer under data', async () => {
    handle.mockResolvedValueOnce({ replies: [{ op: 'send', chat_id: 42, text: 'ok' }] })
    const res = await postUpdate(new Request('http://web/api/internal/telegram/updates', {
      method: 'POST',
      body: JSON.stringify({ update_id: 7, message: { chat: { id: 42, type: 'private' }, from: { id: 42 }, text: '/stop', extra: 'dropped' } }),
    }), undefined)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { replies: [{ op: 'send', chat_id: 42, text: 'ok' }] } })
    expect(handle.mock.calls[0][0]).not.toHaveProperty('message.extra')
  })

  test('POST /updates refuses a body without update_id', async () => {
    const res = await postUpdate(new Request('http://web/api/internal/telegram/updates', { method: 'POST', body: '{}' }), undefined)
    expect(res.status).toBe(400)
    expect(handle).not.toHaveBeenCalled()
  })

  test('GET /outbox runs the health check and maps leased rows to the relay shape', async () => {
    lease.mockResolvedValueOnce([{ id: 'r1', op: 'edit', chatId: '42', text: 't', buttons: null, editMessageId: '77' }])
    const res = await getOutbox(new Request('http://web/api/internal/telegram/outbox?limit=5'), undefined)
    expect(runHealthChecks).toHaveBeenCalled()
    expect(lease).toHaveBeenCalledWith(5, expect.any(Date), 60)
    expect(await res.json()).toEqual({ data: [{ id: 'r1', op: 'edit', chat_id: 42, text: 't', edit_message_id: 77 }] })
  })

  test('POST /outbox/{id}/result rejects an unknown shape and records a valid one', async () => {
    const bad = await postResult(new Request(`http://web/x`, { method: 'POST', body: '{"ok":"yes"}' }), { params: { id: RESULT_ID } })
    expect(bad.status).toBe(400)

    recordResult.mockResolvedValueOnce(true)
    const ok = await postResult(new Request(`http://web/x`, { method: 'POST', body: JSON.stringify({ ok: true, telegram_message_id: 9 }) }), { params: { id: RESULT_ID } })
    expect(ok.status).toBe(200)
    expect(recordResult).toHaveBeenCalledWith(RESULT_ID, { ok: true, telegram_message_id: 9 })
  })

  test('POST /agent/reports is keyed to the caller cooperative and drops figures the web does not use', async () => {
    enqueueReport.mockResolvedValueOnce(true)
    const res = await postAgentReport(new Request('http://web/api/internal/agent/reports', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'daily', period_start: '2026-11-24', period_end: '2026-11-24',
        figures: { journals_new: 2, sensor_alerts: 9, proposals_open: 4 },
      }),
    }), undefined)
    expect(res.status).toBe(201)
    expect(enqueueReport).toHaveBeenCalledWith('TC', 'daily', '2026-11-24', '2026-11-24', { journals_new: 2 })
  })

  test('POST /agent/reports refuses an unknown kind', async () => {
    const res = await postAgentReport(new Request('http://web/api/internal/agent/reports', {
      method: 'POST',
      body: JSON.stringify({ kind: 'monthly', period_start: '2026-11-24', period_end: '2026-11-24', figures: {} }),
    }), undefined)
    expect(res.status).toBe(400)
    expect(enqueueReport).not.toHaveBeenCalled()
  })
})
