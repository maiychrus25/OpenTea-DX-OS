/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHash } from 'crypto'
import { BuildDiseaseDatasetUseCase } from '@/application/disease/build-disease-dataset.usecase'

const row = (id: string, key: string, at = '2026-11-20T08:30:00Z') => ({ report_id: id, household_id: `hh-${id}`, label_code: 'helopeltis', htx_code: 'TC', confirmed_at: new Date(at), photo_minio_key: key })
const cursorOf = (at: string, id: string) => Buffer.from(`${at}|${id}`).toString('base64url')

function build(rows: ReturnType<typeof row>[], pageSize?: number) {
  const source = { findConsented: jest.fn(async () => rows) }
  const storage = {
    getFileBuffer: jest.fn(async (key: string) => { if (key === 'gone') throw new Error('NoSuchKey'); return Buffer.from(`photo:${key}`) }),
    getPresignedUrl: jest.fn(async (key: string, ttl?: number) => `https://s3/${key}?ttl=${ttl}`),
  }
  return { useCase: new BuildDiseaseDatasetUseCase(source as never, storage as never, pageSize), source, storage }
}

describe('BuildDiseaseDatasetUseCase', () => {
  it('lists each photo with its hash and a 15 minute URL, and nothing that names a person', async () => {
    const { useCase, source } = build([row('r1', 'k1')])
    const since = new Date('2026-11-01T00:00:00Z')

    const manifest = await useCase.execute({ since, htxCode: 'TC' })

    expect(source.findConsented).toHaveBeenCalledWith({ since, htxCode: 'TC', after: undefined, limit: 501 })
    expect(manifest).toEqual({ items: [{
      report_id: 'r1', label_code: 'helopeltis', htx_code: 'TC', household_key: createHash('sha256').update('TC:hh-r1').digest('hex').slice(0, 16),
      confirmed_on: '2026-11-20', sha256: createHash('sha256').update('photo:k1').digest('hex'), url: 'https://s3/k1?ttl=900',
    }], next_cursor: null })
    expect(manifest.items[0]).not.toHaveProperty('household_id')
    expect(JSON.stringify(manifest)).not.toContain('hh-r1')
  })

  it('pages: a full page carries a cursor of its last row, equal timestamps included, and the cursor is read back', async () => {
    const rows = [row('r1', 'k1'), row('r2', 'k2'), row('r3', 'k3')] // all confirmed at the same instant
    const { useCase, source } = build(rows, 2)

    const first = await useCase.execute({})
    expect(source.findConsented).toHaveBeenLastCalledWith({ since: undefined, htxCode: undefined, after: undefined, limit: 3 })
    expect(first.items.map((i) => i.report_id)).toEqual(['r1', 'r2'])
    expect(first.next_cursor).toBe(cursorOf('2026-11-20T08:30:00.000Z', 'r2'))

    source.findConsented.mockResolvedValueOnce(rows.slice(2))
    const second = await useCase.execute({ cursor: first.next_cursor! })
    expect(source.findConsented).toHaveBeenLastCalledWith({ since: undefined, htxCode: undefined, after: { confirmed_at: new Date('2026-11-20T08:30:00Z'), id: 'r2' }, limit: 3 })
    expect(second.items.map((i) => i.report_id)).toEqual(['r3'])
    expect(second.next_cursor).toBeNull()
  })

  it('keeps paging past an unreadable photo on the page boundary', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { useCase } = build([row('r1', 'k1'), row('r2', 'gone'), row('r3', 'k3')], 2)
    const page = await useCase.execute({})
    expect(page.items.map((i) => i.report_id)).toEqual(['r1'])
    expect(page.next_cursor).toBe(cursorOf('2026-11-20T08:30:00.000Z', 'r2'))
    jest.restoreAllMocks()
  })

  it('refuses a cursor it did not issue', async () => {
    const { useCase, source } = build([])
    await expect(useCase.execute({ cursor: 'not a cursor' })).rejects.toThrow('cursor')
    expect(source.findConsented).not.toHaveBeenCalled()
  })

  it('skips a photo that is gone from storage with a warning', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { useCase } = build([row('r1', 'gone'), row('r2', 'k2')])

    expect((await useCase.execute({})).items.map((i) => i.report_id)).toEqual(['r2'])
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('is empty when no cooperative has opted in', async () => {
    expect(await build([]).useCase.execute({})).toEqual({ items: [], next_cursor: null })
  })
})
