/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AppsActorClient } from '@/application/agent/app-actions/apps-actor-client'
import { DomainError } from '@/domain/errors'

const approver = { userId: 'u-1', role: 'manager' as const, htxCode: 'TC', htxProfileId: 'htx-tc' }
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function makeClient(opts: { secret?: string; file?: string; responses: unknown[] }) {
  const calls: { url: string; init: RequestInit }[] = []
  const queue = [...opts.responses]
  const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return queue.shift() as Response
  })
  const env: Record<string, string | undefined> = { CORE_GATEWAY_URL: 'http://gw:9081', DXOS_APPS_ACTOR_SECRET: opts.secret }
  const readFile = jest.fn(async () => {
    if (opts.file === undefined) throw new Error('ENOENT')
    return opts.file
  })
  return { client: new AppsActorClient(fetchImpl as unknown as typeof fetch, readFile, env, () => 1_000_000), calls, fetchImpl }
}

const token = json(200, { access_token: 'tok', expires_in: 300 })

describe('AppsActorClient', () => {
  it('gets a client-credentials token and posts with the acting headers and the body', async () => {
    const { client, calls } = makeClient({ secret: 's3', responses: [token, json(200, { promotion_id: 'x' })] })
    const result = await client.call({ appId: 'tea-shop', path: '/agent/actions/promotion-create', body: { a: 1 }, approver })
    expect(result).toEqual({ promotion_id: 'x' })
    expect(calls[0].url).toContain('/protocol/openid-connect/token')
    expect(String(calls[0].init.body)).toContain('client_id=dxos-apps-actor')
    expect(String(calls[0].init.body)).toContain('client_secret=s3')
    expect(calls[1].url).toBe('http://gw:9081/apps/tea-shop/agent/actions/promotion-create')
    const headers = calls[1].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(headers['X-DXOS-Acting-Sub']).toBe('u-1')
    expect(headers['X-DXOS-Acting-Role']).toBe('manager')
    expect(headers['X-DXOS-Acting-Htx']).toBe('TC')
    expect(calls[1].init.body).toBe(JSON.stringify({ a: 1 }))
  })

  it('reads the secret from roles.env when the environment has none', async () => {
    const { client, calls } = makeClient({ file: 'DXOS_APPS_ACTOR_SECRET=fromfile\n', responses: [token, json(200, {})] })
    await client.call({ appId: 'a', path: '/p', body: {}, approver })
    expect(String(calls[0].init.body)).toContain('client_secret=fromfile')
  })

  it('fails with a clear Vietnamese message when there is no secret, without any request', async () => {
    const { client, fetchImpl } = makeClient({ responses: [] })
    await expect(client.call({ appId: 'a', path: '/p', body: {}, approver })).rejects.toThrow(DomainError)
    await expect(client.call({ appId: 'a', path: '/p', body: {}, approver })).rejects.toThrow(/chưa được bật/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('turns a 4xx into a DomainError with the app message', async () => {
    const { client } = makeClient({ secret: 's', responses: [token, json(409, { message_vi: 'Sản phẩm đang có khuyến mãi.' })] })
    await expect(client.call({ appId: 'a', path: '/p', body: {}, approver })).rejects.toThrow('Sản phẩm đang có khuyến mãi.')
  })

  it('turns a 5xx into a system error that is not a DomainError', async () => {
    const { client } = makeClient({ secret: 's', responses: [token, json(500, {})] })
    const error = await client.call({ appId: 'a', path: '/p', body: {}, approver }).catch((e) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(DomainError)
  })

  it('reuses the token until it nears expiry', async () => {
    const { client, fetchImpl } = makeClient({ secret: 's', responses: [token, json(200, {}), json(200, {})] })
    await client.call({ appId: 'a', path: '/p', body: {}, approver })
    await client.call({ appId: 'a', path: '/p', body: {}, approver })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})
