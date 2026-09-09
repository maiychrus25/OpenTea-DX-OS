// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GenerateDocumentDownloadUrlUseCase } from '@/application/document/generate-document-download-url.usecase'
import { DocumentStoragePort } from '@/domain/document/ports/document-storage.port'

describe('GenerateDocumentDownloadUrlUseCase', () => {
  let mockStoragePort: jest.Mocked<DocumentStoragePort>
  let useCase: GenerateDocumentDownloadUrlUseCase

  beforeEach(() => {
    mockStoragePort = {
      generateUploadUrl: jest.fn(),
      generateDownloadUrl: jest.fn(),
      listDocuments: jest.fn(),
      getDocumentContent: jest.fn(),
      uploadDocument: jest.fn(),
    }
    useCase = new GenerateDocumentDownloadUrlUseCase(mockStoragePort)
  })

  it('should throw an error if key does not start with para/', async () => {
    await expect(useCase.execute({ key: 'disease-reports/123.jpg', download: false })).rejects.toThrow(
      'Invalid key. Access denied to non-PARA documents.'
    )
  })

  it('should throw an error if key is empty', async () => {
    await expect(useCase.execute({ key: '', download: false })).rejects.toThrow('key is required')
  })

  it('should generate download url successfully for valid para/ key', async () => {
    mockStoragePort.generateDownloadUrl.mockResolvedValue('https://minio.local/presigned-url')

    const result = await useCase.execute({ key: 'para/Projects/file.pdf', download: true })
    
    expect(mockStoragePort.generateDownloadUrl).toHaveBeenCalledWith('para/Projects/file.pdf', true, 3600)
    expect(result).toEqual({ url: 'https://minio.local/presigned-url' })
  })
})
