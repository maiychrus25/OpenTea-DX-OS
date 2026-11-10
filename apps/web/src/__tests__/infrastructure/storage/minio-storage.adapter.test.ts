/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'

const putObject = jest.fn().mockResolvedValue(undefined)
jest.mock('minio', () => ({
  Client: jest.fn(() => ({
    bucketExists: jest.fn().mockResolvedValue(true),
    putObject,
    presignedGetObject: jest.fn().mockResolvedValue('https://signed'),
  })),
}))

test('uploadFile stores under the namespace of the HTX', async () => {
  const { minioKey } = await new MinioStorageAdapter().uploadFile(Buffer.from('x'), 'diagnosis.jpg', 'image/jpeg', 'TC')
  expect(minioKey).toMatch(/^para\/TC\/Archives\/Disease_Photos\/\d+-diagnosis\.jpg$/)
  expect(putObject.mock.calls[0][1]).toBe(minioKey)
})
