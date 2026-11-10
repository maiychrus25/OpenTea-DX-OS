// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ExportQrUseCase } from '@/application/lot/ExportQrUseCase'
import { LotPort } from '@/domain/lot/ports/LotPort'
import { LotTraceRepository } from '@/domain/repositories/lot-trace-repository'
import { NotFoundError, DomainError } from '@/domain/errors'
import { LotSummary, LotFilters, CreateLotData, ExportQrResult } from '@/domain/lot/ports/LotPort'
import { LotTraceData } from '@/domain/entities/lot-trace-data'
import { StoragePort } from '@/domain/disease/ports/storage.port'
import { DocumentStoragePort } from '@/domain/document/ports/document-storage.port'

jest.mock('qrcode', () => ({
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-qr-code')),
}))

jest.mock('@/infrastructure/storage/minio-storage.adapter', () => {
  return {
    MinioStorageAdapter: jest.fn().mockImplementation(() => ({
      uploadFile: jest.fn().mockResolvedValue({
        presignedUrl: 'https://minio.example.com/qr.png',
        key: 'qr-lot-123.png',
      }),
    })),
  }
})

class MockLotPort implements LotPort {
  async findAll(_filters: LotFilters): Promise<LotSummary[]> {
    return []
  }
  async findById(_id: string): Promise<LotSummary | null> {
    return null
  }
  async create(_data: CreateLotData): Promise<LotSummary> {
    return {} as LotSummary
  }
  async exportQr(_id: string, snapshotData: LotTraceData, qrImageUrl?: string, _certificateKeys?: string[]): Promise<ExportQrResult> {
    return {
      lot_code: snapshotData.lot_code,
      qr_image_url: qrImageUrl ?? '',
      public_page_url: 'url',
    }
  }
}

class MockLotTraceRepo implements LotTraceRepository {
  async getLotByCode(_code: string): Promise<LotTraceData | null> {
    return null
  }
}

describe('ExportQrUseCase', () => {
  let lotPort: MockLotPort
  let traceRepo: MockLotTraceRepo
  let storagePort: jest.Mocked<StoragePort>
  let docStoragePort: jest.Mocked<DocumentStoragePort>
  let useCase: ExportQrUseCase

  beforeEach(() => {
    lotPort = new MockLotPort()
    traceRepo = new MockLotTraceRepo()
    storagePort = { uploadFile: jest.fn().mockResolvedValue({ presignedUrl: 'https://minio.example.com/qr.png', key: 'qr-lot-123.png' }) } as any
    docStoragePort = { uploadDocument: jest.fn().mockResolvedValue(undefined) } as any
    useCase = new ExportQrUseCase(lotPort, traceRepo, storagePort, docStoragePort, 'TC')
  })

  it('throws if lot not found', async () => {
    jest.spyOn(lotPort, 'findById').mockResolvedValue(null)
    await expect(useCase.execute('lot-1')).rejects.toThrow(NotFoundError)
  })

  it('throws if lot already exported', async () => {
    jest.spyOn(lotPort, 'findById').mockResolvedValue({
      status: 'QR_EXPORTED',
    } as LotSummary)
    await expect(useCase.execute('lot-1')).rejects.toThrow(DomainError)
    await expect(useCase.execute('lot-1')).rejects.toThrow('Lot already exported')
  })

  it('throws if trace data not found', async () => {
    jest.spyOn(lotPort, 'findById').mockResolvedValue({
      status: 'READY',
      lot_code: 'LOT-123',
    } as LotSummary)
    jest.spyOn(traceRepo, 'getLotByCode').mockResolvedValue(null)
    
    await expect(useCase.execute('lot-1')).rejects.toThrow(NotFoundError)
  })

  it('throws if withdrawal period not passed', async () => {
    jest.spyOn(lotPort, 'findById').mockResolvedValue({
      status: 'READY',
      lot_code: 'LOT-123',
    } as LotSummary)
    jest.spyOn(traceRepo, 'getLotByCode').mockResolvedValue({
      is_harvest_safe: false, // VIOLATION
      parcels: [{ status: 'HARVESTED' }],
    } as LotTraceData)
    
    await expect(useCase.execute('lot-1')).rejects.toThrow(DomainError)
    await expect(useCase.execute('lot-1')).rejects.toThrow('WITHDRAWAL_NOT_PASSED')
  })

  it('throws if a parcel has invalid status', async () => {
    jest.spyOn(lotPort, 'findById').mockResolvedValue({
      status: 'READY',
      lot_code: 'LOT-123',
    } as LotSummary)
    jest.spyOn(traceRepo, 'getLotByCode').mockResolvedValue({
      is_harvest_safe: true,
      parcels: [{ status: 'DRAFT' }], // VIOLATION
    } as LotTraceData)
    
    await expect(useCase.execute('lot-1')).rejects.toThrow(DomainError)
    await expect(useCase.execute('lot-1')).rejects.toThrow('không ở trạng thái hợp lệ để xuất QR')
  })

  it('exports successfully without extra certificate_keys', async () => {
    jest.spyOn(lotPort, 'findById').mockResolvedValue({
      status: 'READY',
      lot_code: 'LOT-123',
    } as LotSummary)
    
    const traceData = {
      lot_code: 'LOT-123',
      is_harvest_safe: true,
      parcels: [{ status: 'HARVESTED' }, { status: 'TENDING' }],
      certificate_keys: ['cert1.pdf'],
    } as LotTraceData

    jest.spyOn(traceRepo, 'getLotByCode').mockResolvedValue(traceData)
    
    const spyExportQr = jest.spyOn(lotPort, 'exportQr')
    
    const result = await useCase.execute('lot-1')
    
    expect(result).toBeDefined()
    expect(spyExportQr).toHaveBeenCalledWith(
      'lot-1', 
      traceData, 
      'https://minio.example.com/qr.png', 
      undefined
    )
    expect(traceData.certificate_keys).toEqual(['cert1.pdf'])
  })

  it('exports successfully and merges certificate_keys', async () => {
    jest.spyOn(lotPort, 'findById').mockResolvedValue({
      status: 'READY',
      lot_code: 'LOT-123',
    } as LotSummary)
    
    const traceData = {
      lot_code: 'LOT-123',
      is_harvest_safe: true,
      parcels: [{ status: 'HARVEST_APPROVED' }],
      certificate_keys: ['cert1.pdf'],
    } as LotTraceData

    jest.spyOn(traceRepo, 'getLotByCode').mockResolvedValue(traceData)
    
    const spyExportQr = jest.spyOn(lotPort, 'exportQr')
    
    const result = await useCase.execute('lot-1', ['cert2.pdf', 'cert1.pdf'])
    
    expect(result).toBeDefined()
    expect(spyExportQr).toHaveBeenCalledWith(
      'lot-1', 
      traceData, 
      'https://minio.example.com/qr.png', 
      ['cert2.pdf', 'cert1.pdf']
    )
    expect(traceData.certificate_keys).toEqual(['cert1.pdf', 'cert2.pdf'])
  })

  it('archives the export and stores the QR under the namespace of the HTX', async () => {
    jest.spyOn(lotPort, 'findById').mockResolvedValue({ status: 'READY', lot_code: 'LOT-123' } as LotSummary)
    jest.spyOn(traceRepo, 'getLotByCode').mockResolvedValue({
      lot_code: 'LOT-123',
      is_harvest_safe: true,
      parcels: [{ status: 'HARVESTED' }],
      certificate_keys: [],
    } as unknown as LotTraceData)

    await useCase.execute('lot-1')
    const uploads = docStoragePort.uploadDocument as jest.Mock
    for (let i = 0; i < 100 && uploads.mock.calls.length < 2; i++) await new Promise(r => setTimeout(r, 10))

    expect(uploads.mock.calls.map(c => c[0])).toEqual([
      'para/TC/Archives/Lô hàng đã xuất/Mã_QR_Lô_LOT-123.png',
      'para/TC/Archives/Lô hàng đã xuất/Hồ_sơ_truy_xuất_Lô_LOT-123.txt',
    ])
    expect((storagePort.uploadFile as jest.Mock).mock.calls[0][3]).toBe('TC')
  })
})
