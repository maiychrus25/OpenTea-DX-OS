/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHash } from 'crypto'
import { BuildDiseaseDatasetUseCase } from '@/application/disease/build-disease-dataset.usecase'

const row = (id: string, key: string) => ({ report_id: id, label_code: 'helopeltis', htx_code: 'TC', confirmed_at: new Date('2026-11-20T08:30:00Z'), photo_minio_key: key })

function build(rows: ReturnType<typeof row>[]) {
  const source = { findConsented: jest.fn(async () => rows) }
  const storage = {
    getFileBuffer: jest.fn(async (key: string) => { if (key === 'gone') throw new Error('NoSuchKey'); return Buffer.from(`photo:${key}`) }),
    getPresignedUrl: jest.fn(async (key: string, ttl?: number) => `https://s3/${key}?ttl=${ttl}`),
  }
  return { useCase: new BuildDiseaseDatasetUseCase(source as never, storage as never), source, storage }
}

describe('BuildDiseaseDatasetUseCase', () => {
  it('lists each photo with its hash and a 15 minute URL, and nothing that names a person', async () => {
    const { useCase, source } = build([row('r1', 'k1')])
    const since = new Date('2026-11-01T00:00:00Z')

    const manifest = await useCase.execute({ since, htxCode: 'TC' })

    expect(source.findConsented).toHaveBeenCalledWith({ since, htxCode: 'TC', limit: 500 })
    expect(manifest.items).toEqual([{
      report_id: 'r1', label_code: 'helopeltis', htx_code: 'TC', confirmed_on: '2026-11-20',
      sha256: createHash('sha256').update('photo:k1').digest('hex'), url: 'https://s3/k1?ttl=900',
    }])
  })

  it('skips a photo that is gone from storage with a warning', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { useCase } = build([row('r1', 'gone'), row('r2', 'k2')])

    expect((await useCase.execute({})).items.map((i) => i.report_id)).toEqual(['r2'])
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('is empty when no cooperative has opted in', async () => {
    expect(await build([]).useCase.execute({})).toEqual({ items: [] })
  })
})
