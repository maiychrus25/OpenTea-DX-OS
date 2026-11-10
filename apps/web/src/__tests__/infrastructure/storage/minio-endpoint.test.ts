/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Client } from 'minio'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'

jest.mock('minio', () => ({ Client: jest.fn(() => ({})) }))

const ENV = { ...process.env }
afterEach(() => {
  process.env = { ...ENV }
})

/** [internal, public] client options as host:port. */
function endpoints(Adapter: new () => unknown, minioEndpoint: string | undefined) {
  ;(Client as unknown as jest.Mock).mockClear()
  delete process.env.MINIO_PUBLIC_ENDPOINT
  if (minioEndpoint === undefined) delete process.env.MINIO_ENDPOINT
  else process.env.MINIO_ENDPOINT = minioEndpoint
  new Adapter()
  return (Client as unknown as jest.Mock).mock.calls.map(([o]) => `${o.endPoint}:${o.port}`)
}

describe.each([
  ['MinioStorageAdapter', MinioStorageAdapter],
  ['MinioDocumentAdapter', MinioDocumentAdapter],
])('%s endpoint', (_name, Adapter) => {
  it('accepts host:port as in docker/.env.local.example', () => {
    expect(endpoints(Adapter, 'minio:9000')).toEqual(['minio:9000', 'localhost:9000'])
  })

  it('keeps a bare host and the default', () => {
    expect(endpoints(Adapter, 'minio')).toEqual(['minio:9000', 'localhost:9000'])
    expect(endpoints(Adapter, undefined)).toEqual(['minio:9000', 'localhost:9000'])
  })

  it('uses another host and its port for both clients', () => {
    expect(endpoints(Adapter, 'storage.example.test:8333')).toEqual(['storage.example.test:8333', 'storage.example.test:8333'])
  })
})
