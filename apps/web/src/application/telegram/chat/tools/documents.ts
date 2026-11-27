// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { formatVnDate } from '@/application/agent/actions/journal-labels'
import { ListDocumentsUseCase } from '@/application/document/list-documents.usecase'
import { documentRoot } from '@/domain/document/document-namespace'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import type { ChatTool } from '../types'
import { reply } from './common'

/**
 * Routes: `GET /api/documents` and `GET /api/documents/url`. Chat lists the cooperative's top folder by name and date;
 * a signed URL is never made here, so a file is opened in the app.
 */
export const documentsTool: ChatTool = {
  name: 'documents',
  titleVi: 'Tài liệu',
  roles: ['officer', 'manager'],
  routes: ['GET /api/documents', 'GET /api/documents/url'],
  args: [],
  async run(user) {
    const { documents } = await new ListDocumentsUseCase(new MinioDocumentAdapter()).execute({ pathPrefix: documentRoot(user.tenant.htxCode) })
    return reply(
      'Tài liệu',
      documents.slice(0, 10).map((item) => (item.isDir ? `${item.name}/` : `${item.name} · ${formatVnDate(item.uploadDate) ?? '—'}`))
    )
  },
}
