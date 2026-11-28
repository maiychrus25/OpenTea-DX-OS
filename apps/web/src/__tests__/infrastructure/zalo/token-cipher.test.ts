/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ZaloCredentialService } from '@/application/zalo/ZaloCredentialService'
import { decryptToken, encryptToken } from '@/infrastructure/crypto/zalo-token-cipher'
import { FakeZaloRepository } from '../../../../__tests__/__mocks__/zalo-fakes'

const KEY = 'a'.repeat(64)
const original = process.env.DXOS_ZALO_TOKEN_KEY
afterEach(() => { if (original === undefined) delete process.env.DXOS_ZALO_TOKEN_KEY; else process.env.DXOS_ZALO_TOKEN_KEY = original })

describe('Zalo token cipher', () => {
  it('round-trips with AES-256-GCM, a fresh IV each time, and hides the plain text', () => {
    process.env.DXOS_ZALO_TOKEN_KEY = KEY
    const a = encryptToken('oa-secret-token')
    expect(a).toMatch(/^v1:/)
    expect(a).not.toContain('oa-secret-token')
    expect(encryptToken('oa-secret-token')).not.toBe(a)
    expect(decryptToken(a)).toBe('oa-secret-token')
  })

  it('refuses to encrypt without a key, with a wrong-size key, and refuses a tampered value', () => {
    delete process.env.DXOS_ZALO_TOKEN_KEY
    expect(() => encryptToken('x')).toThrow(/not set/)
    // A refusal the admin can read (422 ZALO_TOKEN_KEY_MISSING), not a bare 500.
    expect(() => encryptToken('x')).toThrow(expect.objectContaining({ code: 'ZALO_TOKEN_KEY_MISSING', message: expect.stringMatching(/DXOS_ZALO_TOKEN_KEY/) }))
    process.env.DXOS_ZALO_TOKEN_KEY = 'abcd'
    expect(() => encryptToken('x')).toThrow(/32 bytes/)
    process.env.DXOS_ZALO_TOKEN_KEY = KEY
    const parts = encryptToken('x').split(':')
    parts[3] = Buffer.from('tampered!').toString('base64')
    expect(() => decryptToken(parts.join(':'))).toThrow()
  })
})

describe('ZaloCredentialService', () => {
  it('stores ciphertext, gives the relay the clear tokens and shows the admin only the last 4 characters', async () => {
    process.env.DXOS_ZALO_TOKEN_KEY = KEY
    const repo = new FakeZaloRepository()
    const service = new ZaloCredentialService(repo, { encrypt: encryptToken, decrypt: decryptToken })
    expect(await service.forRelay()).toBeNull()
    await service.save({ access_token: 'access-token-1234', refresh_token: 'refresh-token-9999', expires_at: '2026-12-01T00:00:00.000Z' }, 'admin-1')
    expect(JSON.stringify(repo.stored)).not.toMatch(/access-token|refresh-token/)
    expect(await service.forRelay()).toEqual({ access_token: 'access-token-1234', refresh_token: 'refresh-token-9999', expires_at: '2026-12-01T00:00:00.000Z' })
    const summary = await service.summary()
    expect(summary).toMatchObject({ configured: true, access_token_last4: '1234' })
    expect(JSON.stringify(summary)).not.toContain('refresh-token')
  })

  it('does not store anything when the key is missing', async () => {
    delete process.env.DXOS_ZALO_TOKEN_KEY
    const repo = new FakeZaloRepository()
    const service = new ZaloCredentialService(repo, { encrypt: encryptToken, decrypt: decryptToken })
    await expect(service.save({ access_token: 'a', refresh_token: 'b', expires_at: '2026-12-01T00:00:00Z' }, 'admin-1')).rejects.toThrow()
    expect(repo.stored).toBeNull()
  })
})
