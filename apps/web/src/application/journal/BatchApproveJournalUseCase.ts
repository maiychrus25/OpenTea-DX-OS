// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { JournalPort } from '@/domain/journal/ports/JournalPort'
import { DocumentStoragePort } from '@/domain/document/ports/document-storage.port'
import { documentRoot } from '@/domain/document/document-namespace'

export class BatchApproveJournalUseCase {
  constructor(
    private readonly journalPort: JournalPort,
    private readonly documentStoragePort: DocumentStoragePort
  ) {}

  async execute(entryIds: string[], approvedById: string, htxCode: string) {
    const result = await this.journalPort.batchApprove(entryIds, approvedById)

    // Generate PARA HTML document for each approved entry
    // Doing this outside DB transaction to avoid blocking
    if (result.approved > 0) {
      for (const id of entryIds) {
        if (!result.failed.includes(id)) {
          const entry = await this.journalPort.findById(id)
          if (entry) {
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Báo cáo Nhật ký - ${entry.parcel_code}</title>
<style>
  body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
  h1 { color: #2c5282; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
  .meta { background: #f7fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
  .meta p { margin: 5px 0; }
  .photo { margin-top: 20px; text-align: center; }
  .photo img { max-width: 100%; border-radius: 8px; border: 1px solid #cbd5e0; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
  th { background: #edf2f7; }
</style>
</head>
<body>
  <h1>Báo cáo Nhật ký Canh tác</h1>
  
  <div class="meta">
    <p><strong>Mã thửa:</strong> ${entry.parcel_code || entry.parcel_id}</p>
    <p><strong>Ngày thực hiện:</strong> ${new Date(entry.entry_date).toLocaleDateString('vi-VN')}</p>
    <p><strong>Người thực hiện:</strong> ${entry.performed_by}</p>
    <p><strong>Hoạt động chính:</strong> ${entry.activity_type}</p>
    <p><strong>Ngày duyệt:</strong> ${new Date().toLocaleDateString('vi-VN')}</p>
  </div>

  <h2>Chi tiết hoạt động</h2>
  <table>
    <tr>
      <th>Chi tiết</th>
      <th>Sản phẩm</th>
      <th>Liều lượng</th>
      <th>Cách ly (ngày)</th>
    </tr>
    ${entry.activities.map(a => `
      <tr>
        <td>${a.activity_detail}</td>
        <td>${a.product_name || '-'}</td>
        <td>${a.dosage || '-'}</td>
        <td>${a.withdrawal_days || '-'}</td>
      </tr>
    `).join('')}
  </table>

  <h2>Ghi chú / Quan sát</h2>
  <p>${entry.notes || 'Không có ghi chú.'}</p>

  ${entry.photo_minio_key ? `
    <div class="photo">
      <h2>Hình ảnh đính kèm</h2>
      <!-- The photo is stored in the system, viewing requires signed URL in app. 
           We just record the reference here for strict PARA archiving -->
      <p><em>[Hình ảnh được lưu trữ tại hệ thống P.A.R.A với mã: ${entry.photo_minio_key}]</em></p>
    </div>
  ` : ''}
</body>
</html>`
            
            const key = `${documentRoot(htxCode)}Archives/Journals/Records/${id}.html`
            await this.documentStoragePort.uploadDocument(key, htmlContent, 'text/html')
          }
        }
      }
    }

    return result
  }
}
