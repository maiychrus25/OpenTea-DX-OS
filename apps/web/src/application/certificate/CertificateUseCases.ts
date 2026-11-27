// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { randomUUID } from 'crypto'
import { ConflictError, NotFoundError } from '@/domain/errors'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { documentRoot } from '@/domain/document/document-namespace'
import { CERTIFICATE_MAX_BYTES, FileRejectedError, checkCertificateFile, safeFileName } from '@/domain/certificate/file-check'
import { certificateStatus } from '@/domain/certificate/status'
import type { CertificatePort } from '@/domain/certificate/ports/CertificatePort'
import type { CertificateRow, CertificateView, CertificateKind } from '@/domain/certificate/views'
import type { DocumentStoragePort } from '@/domain/document/ports/document-storage.port'

export interface CertificateActor { userId: string; htxProfileId: string; htxCode: string }

export function toCertificateView(c: CertificateRow, today = vnDayOf(new Date())): CertificateView {
  return {
    id: c.id, kind: c.kind, number: c.number, issuer: c.issuer, issued_on: c.issued_on, expires_on: c.expires_on,
    scope_note: c.scope_note, file_name: c.file_name, file_mime: c.file_mime, file_size: c.file_size,
    revoked_at: c.revoked_at ? c.revoked_at.toISOString() : null, revoke_reason: c.revoke_reason,
    status: certificateStatus(c, today),
  }
}

export class ListCertificates {
  constructor(private readonly certificates: CertificatePort) {}
  async execute(actor: CertificateActor): Promise<CertificateView[]> {
    const today = vnDayOf(new Date())
    return (await this.certificates.list(actor.htxProfileId)).map((c) => toCertificateView(c, today))
  }
}

export interface CreateCertificateInput {
  kind: CertificateKind
  number: string
  issuer: string
  issued_on: string
  expires_on: string
  scope_note?: string
  file: { name: string; mime: string; bytes: Buffer }
}

export class CreateCertificate {
  constructor(private readonly certificates: CertificatePort, private readonly storage: Pick<DocumentStoragePort, 'uploadDocument'>) {}

  async execute(actor: CertificateActor, input: CreateCertificateInput): Promise<CertificateView> {
    const { file } = input
    if (file.bytes.length > CERTIFICATE_MAX_BYTES) throw new FileRejectedError('FILE_TOO_LARGE', 'Tệp lớn hơn 10 MB')
    const mime = checkCertificateFile(file.bytes, file.mime)
    if (!mime) throw new FileRejectedError('FILE_TYPE', 'Chỉ nhận tệp PDF, JPG hoặc PNG')
    const fileName = safeFileName(file.name) || 'certificate'
    const key = `${documentRoot(actor.htxCode)}Certificates/${randomUUID()}-${fileName}`
    await this.storage.uploadDocument(key, file.bytes, mime)
    const row = await this.certificates.create({
      htxProfileId: actor.htxProfileId, userId: actor.userId, kind: input.kind, number: input.number, issuer: input.issuer,
      issued_on: input.issued_on, expires_on: input.expires_on, scope_note: input.scope_note || null,
      file_key: key, file_name: fileName, file_mime: mime, file_size: file.bytes.length,
    })
    return toCertificateView(row)
  }
}

export class CertificateFileUrl {
  constructor(private readonly certificates: CertificatePort, private readonly storage: Pick<DocumentStoragePort, 'generateDownloadUrl'>) {}
  async execute(actor: CertificateActor, id: string): Promise<string> {
    const row = await this.certificates.find(actor.htxProfileId, id)
    if (!row) throw new NotFoundError('Certificate not found')
    return this.storage.generateDownloadUrl(row.file_key, false, 3600)
  }
}

export class RevokeCertificate {
  constructor(private readonly certificates: CertificatePort) {}
  async execute(actor: CertificateActor, id: string, reason: string): Promise<CertificateView> {
    const row = await this.certificates.revoke(actor.htxProfileId, id, actor.userId, reason)
    if (row) return toCertificateView(row)
    // Nothing was written: either it is not ours or it was revoked already.
    if (!(await this.certificates.find(actor.htxProfileId, id))) throw new NotFoundError('Certificate not found')
    throw new ConflictError('CERTIFICATE_REVOKED', 'Chứng nhận đã được thu hồi trước đó.')
  }
}
