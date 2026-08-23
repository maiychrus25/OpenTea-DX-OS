// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { DocumentStoragePort } from '@/domain/document/ports/document-storage.port'

export interface GenerateDocumentDownloadUrlCommand {
  key: string
  download: boolean
}

export class GenerateDocumentDownloadUrlUseCase {
  constructor(private readonly storagePort: DocumentStoragePort) {}

  async execute(command: GenerateDocumentDownloadUrlCommand) {
    if (!command.key) {
      throw new Error('key is required')
    }

    // Ensure key starts with para/ to prevent exposing private objects
    if (!command.key.startsWith('para/')) {
      throw new Error('Invalid key. Access denied to non-PARA documents.')
    }

    // Expire in 60 mins (3600s)
    const url = await this.storagePort.generateDownloadUrl(command.key, command.download, 3600)
    
    return { url }
  }
}
