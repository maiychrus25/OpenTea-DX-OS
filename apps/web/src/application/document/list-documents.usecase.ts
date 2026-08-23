// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { DocumentStoragePort } from '@/domain/document/ports/document-storage.port'

export interface ListDocumentsCommand {
  pathPrefix: string
}

export class ListDocumentsUseCase {
  constructor(private readonly storagePort: DocumentStoragePort) {}

  async execute(command: ListDocumentsCommand) {
    let prefix = command.pathPrefix || 'para/'
    
    // Ensure prefix starts with para/ to prevent exposing private objects
    if (!prefix.startsWith('para/')) {
      throw new Error('Invalid path prefix. Access denied to non-PARA directories.')
    }

    // Ensure prefix ends with / if it's not empty and doesn't already
    if (prefix && !prefix.endsWith('/')) {
      prefix = `${prefix}/`
    }
    
    const documents = await this.storagePort.listDocuments(prefix)
    
    // Sort directories first, then by uploadDate descending
    documents.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1
      if (!a.isDir && b.isDir) return 1
      return b.uploadDate.getTime() - a.uploadDate.getTime()
    })
    
    return {
      documents,
      count: documents.length
    }
  }
}
