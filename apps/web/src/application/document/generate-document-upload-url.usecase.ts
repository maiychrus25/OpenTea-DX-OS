// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { DocumentStoragePort } from '@/domain/document/ports/document-storage.port'

export interface GenerateDocumentUploadUrlCommand {
  fileName: string
  pathPrefix: string // e.g., 'para/Projects/'
}

export class GenerateDocumentUploadUrlUseCase {
  constructor(private readonly storagePort: DocumentStoragePort) {}

  async execute(command: GenerateDocumentUploadUrlCommand) {
    if (!command.fileName || !command.pathPrefix) {
      throw new Error('fileName and pathPrefix are required')
    }

    // Sanitize path to prevent directory traversal
    const safeFileName = command.fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    // Ensure pathPrefix ends with /
    const prefix = command.pathPrefix.endsWith('/') ? command.pathPrefix : `${command.pathPrefix}/`
    
    // Valid prefixes according to PARA
    const validPrefixes = ['para/Projects/', 'para/Areas/', 'para/Resources/', 'para/Archives/']
    if (!validPrefixes.some(vp => prefix.startsWith(vp))) {
      throw new Error('Invalid path prefix. Must be one of the P.A.R.A categories.')
    }

    const path = `${prefix}${safeFileName}`
    
    // Expire in 15 mins (900s)
    const result = await this.storagePort.generateUploadUrl(path, 900)
    
    return {
      uploadUrl: result.url,
      key: result.key,
      expiresIn: 900
    }
  }
}
