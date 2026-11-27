// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { PhotoStore } from '@/application/telegram/chat/types'
import { MinioDocumentAdapter } from './minio-document.adapter'

/** Chat photos kept in the private bucket under the keys the flow steps choose (journal and disease photo keys). */
export class TelegramPhotoStore implements PhotoStore {
  constructor(private readonly storage: MinioDocumentAdapter = new MinioDocumentAdapter()) {}

  put(key: string, bytes: Buffer, mimeType: 'image/jpeg' | 'image/png'): Promise<void> {
    return this.storage.uploadDocument(key, bytes, mimeType)
  }

  get(key: string): Promise<Buffer> {
    return this.storage.downloadDocument(key)
  }

  delete(key: string): Promise<void> {
    return this.storage.deleteDocument(key)
  }
}
