// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import * as QRCode from 'qrcode'
import { ExportQrUseCase } from '@/application/lot/ExportQrUseCase'
import type { CertificatePort } from '@/domain/certificate/ports/CertificatePort'
import type { CertificateRow } from '@/domain/certificate/views'
import type { LotTraceData } from '@/domain/entities/lot-trace-data'
import type { LotSummary } from '@/domain/lot/ports/LotPort'

jest.mock('qrcode', () => ({ toBuffer: jest.fn().mockResolvedValue(Buffer.from('qr')), toDataURL: jest.fn() }))

const LOT = { status: 'READY', lot_code: 'TC-CHE-20261127-001', harvest_date: new Date('2026-11-27T00:00:00Z') } as LotSummary
const cert = (id: string): CertificateRow => ({
  id, htx_profile_id: 'htx-tc', kind: 'VIETGAP', number: `VG-${id}`, issuer: 'Sở NN', issued_on: '2026-01-01', expires_on: '2027-01-01',
  scope_note: null, file_key: `para/TC/Certificates/${id}.pdf`, file_name: `${id}.pdf`, file_mime: 'application/pdf', file_size: 10, revoked_at: null, revoke_reason: null,
})
const batchTrace = (over: Partial<LotTraceData> = {}) => ({
  lot_code: LOT.lot_code, is_harvest_safe: true, parcels: [{ parcel_code: 'P1', status: 'TENDING' }], certificate_keys: [],
  batches: [{ batch_code: 'TC-MS-20261127-01' }], ...over,
}) as unknown as LotTraceData

const labsBefore = process.env.DXOS_LABS
afterEach(() => { if (labsBefore === undefined) delete process.env.DXOS_LABS; else process.env.DXOS_LABS = labsBefore })

function setup(trace: LotTraceData, valid: Awaited<ReturnType<CertificatePort['validForLot']>> = { ok: [] }) {
  const lotPort = { findById: jest.fn().mockResolvedValue(LOT), exportQr: jest.fn().mockResolvedValue({ lot_code: LOT.lot_code, qr_image_url: 'u', public_page_url: 'p' }) }
  const traceRepo = { getLotByCode: jest.fn().mockResolvedValue(trace), getParcelHarvests: jest.fn().mockResolvedValue([]) }
  const certs = { validForLot: jest.fn().mockResolvedValue(valid) }
  const docs = { uploadDocument: jest.fn().mockResolvedValue(undefined) }
  const useCase = new ExportQrUseCase(lotPort as never, traceRepo as never, { uploadFile: jest.fn().mockResolvedValue({ presignedUrl: 'https://m/qr.png' }) } as never, docs as never, 'TC', certs as unknown as CertificatePort)
  return { useCase, lotPort, traceRepo, certs }
}

describe('ExportQrUseCase, phase 2', () => {
  it('refuses a lot without a batch source with 422 LOT_WITHOUT_BATCH and exports nothing', async () => {
    delete process.env.DXOS_LABS
    const { useCase, lotPort } = setup(batchTrace({ batches: [] }))
    await expect(useCase.execute('l1')).rejects.toMatchObject({ code: 'LOT_WITHOUT_BATCH' })
    expect(lotPort.exportQr).not.toHaveBeenCalled()
  })

  it('lets a lot without a batch source through while labs is on', async () => {
    process.env.DXOS_LABS = '1'
    const { useCase, lotPort, traceRepo } = setup(batchTrace({ batches: undefined }))
    traceRepo.getParcelHarvests.mockResolvedValue([{ parcel_code: 'P1', harvested_at: [new Date('2026-11-01T00:00:00Z')] }])
    await useCase.execute('l1')
    expect(lotPort.exportQr).toHaveBeenCalled()
  })

  it('answers 422 WITHDRAWAL_NOT_PASSED when a source ticket was weighed inside a withdrawal (Review Focus 3)', async () => {
    const { useCase, lotPort } = setup(batchTrace({ is_harvest_safe: false }))
    await expect(useCase.execute('l1')).rejects.toMatchObject({ code: 'WITHDRAWAL_NOT_PASSED' })
    expect(lotPort.exportQr).not.toHaveBeenCalled()
  })

  it('does not run the parcel-round check for a lot from batches', async () => {
    const { useCase, traceRepo } = setup(batchTrace())
    await useCase.execute('l1')
    expect(traceRepo.getParcelHarvests).not.toHaveBeenCalled()
  })

  it('attaches every valid certificate of the HTX by default, in the snapshot, the keys and the lot link', async () => {
    const { useCase, lotPort, certs } = setup(batchTrace(), { ok: [cert('c1'), cert('c2')] })
    await useCase.execute('l1', undefined, 'https://tea.example', { htxProfileId: 'htx-tc' })
    expect(certs.validForLot).toHaveBeenCalledWith('htx-tc', null, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    const [, snapshot, , keys, attach] = lotPort.exportQr.mock.calls[0]
    expect(snapshot.certificates.map((c: { id: string }) => c.id)).toEqual(['c1', 'c2'])
    expect(snapshot.certificates[0]).not.toHaveProperty('revoked_at')
    expect(keys).toEqual(['para/TC/Certificates/c1.pdf', 'para/TC/Certificates/c2.pdf'])
    expect(snapshot.certificate_keys).toEqual(keys)
    expect(attach).toMatchObject({ htxProfileId: 'htx-tc', ids: ['c1', 'c2'] })
  })

  it('refuses a revoked, expired or foreign certificate id with 422 CERTIFICATE_NOT_VALID (Review Focus 5)', async () => {
    const { useCase, lotPort, certs } = setup(batchTrace(), { invalid: ['c9'] })
    await expect(useCase.execute('l1', undefined, undefined, { htxProfileId: 'htx-tc', certificateIds: ['c1', 'c9'] })).rejects.toMatchObject({ code: 'CERTIFICATE_NOT_VALID', details: { certificate_ids: ['c9'] } })
    expect(certs.validForLot).toHaveBeenCalledWith('htx-tc', ['c1', 'c9'], expect.any(String))
    expect(lotPort.exportQr).not.toHaveBeenCalled()
  })

  it('encodes the /q page in the QR, not /lot', async () => {
    const { useCase } = setup(batchTrace())
    await useCase.execute('l1', undefined, 'https://tea.example/')
    expect(QRCode.toBuffer).toHaveBeenCalledWith('https://tea.example/q/TC-CHE-20261127-001', expect.anything())
  })
})
