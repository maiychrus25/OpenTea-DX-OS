// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ListDocumentsUseCase } from '@/application/document/list-documents.usecase'
import { DocumentStoragePort } from '@/domain/document/ports/document-storage.port'

describe('ListDocumentsUseCase', () => {
  let mockStoragePort: jest.Mocked<DocumentStoragePort>
  let useCase: ListDocumentsUseCase

  beforeEach(() => {
    mockStoragePort = {
      generateUploadUrl: jest.fn(),
      generateDownloadUrl: jest.fn(),
      listDocuments: jest.fn(),
    }
    useCase = new ListDocumentsUseCase(mockStoragePort)
  })

  it('should throw an error if pathPrefix does not start with para/', async () => {
    await expect(useCase.execute({ pathPrefix: 'disease-reports/' })).rejects.toThrow(
      'Invalid path prefix. Access denied to non-PARA directories.'
    )
  })

  it('should list documents successfully for valid para/ prefix', async () => {
    mockStoragePort.listDocuments.mockResolvedValue([])

    const result = await useCase.execute({ pathPrefix: 'para/Projects' })
    
    expect(mockStoragePort.listDocuments).toHaveBeenCalledWith('para/Projects/')
    expect(result).toHaveProperty('documents', [])
  })

  it('should default to para/ if no pathPrefix is provided', async () => {
    mockStoragePort.listDocuments.mockResolvedValue([])

    await useCase.execute({ pathPrefix: '' })
    
    expect(mockStoragePort.listDocuments).toHaveBeenCalledWith('para/')
  })
})
