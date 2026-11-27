/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { DomainError } from '@/domain/errors'
import { WebServiceTokenProvider, WEB_SERVICE_NOT_ENABLED } from '@/infrastructure/auth/web-service-token'

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function make(opts: { secret?: string; file?: string; responses?: unknown[]; clock?: { now: number } }) {
  const calls: { url: string; init: RequestInit }[] = []
  const queue = [...(opts.responses ?? [])]
  const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return queue.shift() as Response
  })
  const readFile = jest.fn(async () => {
    if (opts.file === undefined) throw new Error('ENOENT')
    return opts.file
  })
  const clock = opts.clock ?? { now: 1_000_000 }
  const env = { DXOS_WEB_SERVICE_SECRET: opts.secret, KEYCLOAK_INTERNAL_URL: 'http://kc/realms/agrimarket' }
  return { provider: new WebServiceTokenProvider(fetchImpl as unknown as typeof fetch, readFile, env, () => clock.now), calls, fetchImpl, clock }
}

const token = (value = 'tok', expiresIn = 300) => json(200, { access_token: value, expires_in: expiresIn })

describe('WebServiceTokenProvider', () => {
  it('asks Keycloak for a client-credentials token of dxos-web-service with the environment secret', async () => {
    const { provider, calls } = make({ secret: 's3', responses: [token()] })
    expect(await provider.get()).toBe('tok')
    expect(calls[0].url).toBe('http://kc/realms/agrimarket/protocol/openid-connect/token')
    const body = String(calls[0].init.body)
    expect(body).toContain('grant_type=client_credentials')
    expect(body).toContain('client_id=dxos-web-service')
    expect(body).toContain('client_secret=s3')
  })

  it('reads the secret from roles.env when the environment has none', async () => {
    const { provider, calls } = make({ file: 'DXOS_APPS_ACTOR_SECRET=x\nDXOS_WEB_SERVICE_SECRET=fromfile\n', responses: [token()] })
    await provider.get()
    expect(String(calls[0].init.body)).toContain('client_secret=fromfile')
  })

  it('answers the Vietnamese not-enabled message, with no request, when there is no secret', async () => {
    const { provider, fetchImpl } = make({})
    await expect(provider.get()).rejects.toThrow(DomainError)
    await expect(provider.get()).rejects.toThrow(WEB_SERVICE_NOT_ENABLED)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps the token until shortly before it expires, then asks again', async () => {
    const { provider, fetchImpl, clock } = make({ secret: 's', responses: [token('a', 300), token('b', 300)] })
    expect(await provider.get()).toBe('a')
    clock.now += 200_000
    expect(await provider.get()).toBe('a')
    clock.now += 100_000
    expect(await provider.get()).toBe('b')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not put the secret in the error when Keycloak refuses', async () => {
    const { provider } = make({ secret: 'topsecret', responses: [json(401, {})] })
    const error = await provider.get().then(() => null, (e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error!.message).not.toContain('topsecret')
  })
})
