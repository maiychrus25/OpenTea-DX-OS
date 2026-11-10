// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { DiseaseReportPort } from '@/domain/disease/ports/disease-report.port';
import { NotificationPort } from '@/domain/ports/notification-port';
import { StoragePort } from '@/domain/disease/ports/storage.port';
import { DocumentStoragePort } from '@/domain/document/ports/document-storage.port';
import { NotificationType } from '@prisma/client';
import { documentRoot } from '@/domain/document/document-namespace';

export interface ReviewDiseaseReportCommand {
  reportId: string;
  officerId: string;
  htxCode: string;
  status: 'CONFIRMED' | 'REJECTED';
  treatment_recommendation: string;
}

export class ReviewDiseaseReportUseCase {
  constructor(
    private diseaseReportPort: DiseaseReportPort,
    private notificationPort: NotificationPort,
    private storagePort: StoragePort,
    private documentStoragePort: DocumentStoragePort
  ) {}

  async execute(command: ReviewDiseaseReportCommand): Promise<void> {
    const report = await this.diseaseReportPort.findById(command.reportId);
    
    if (!report) {
      throw new Error('REPORT_NOT_FOUND');
    }

    if (report.status !== 'PENDING') {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    if (command.status === 'CONFIRMED' && (!command.treatment_recommendation || command.treatment_recommendation.trim().length === 0)) {
      throw new Error('TREATMENT_REQUIRED');
    }

    await this.diseaseReportPort.updateStatus(
      command.reportId,
      command.status,
      command.treatment_recommendation,
      command.officerId
    );

    const title = command.status === 'CONFIRMED' ? 'Báo cáo bệnh đã duyệt' : 'Báo cáo bệnh bị từ chối';
    let body = `Báo cáo bệnh ${report.ai_disease_name} tại thửa ${report.parcel_code} đã được cán bộ phản hồi.`;
    
    if (command.status === 'CONFIRMED') {
      body += ` Hướng dẫn: ${command.treatment_recommendation}`;

      // User request: Transfer confirmed report to PARA (agrimarket-private)
      try {
        // 1. Upload a markdown report document
        const reportContent = `# Báo cáo bệnh hại (Đã duyệt)
- Thửa đất: ${report.parcel_code}
- Nông hộ: ${report.farmer_name}
- Ngày phát hiện: ${report.detection_date.toLocaleDateString('vi-VN')}
- Bệnh AI chẩn đoán: ${report.ai_disease_name} (Độ tin cậy: ${(report.ai_confidence * 100).toFixed(1)}%)
- Hướng dẫn điều trị: ${command.treatment_recommendation}
`;
        await this.documentStoragePort.uploadDocument(
          `${documentRoot(command.htxCode)}Archives/disease-report-${report.id}.md`,
          reportContent,
          'text/markdown'
        );

        // 2. Transfer the image from public/docs bucket to PARA
        if (report.photo_minio_key) {
          const imageBuffer = await this.storagePort.getFileBuffer(report.photo_minio_key);
          await this.documentStoragePort.uploadDocument(
            `${documentRoot(command.htxCode)}Archives/disease-report-${report.id}.jpg`,
            imageBuffer,
            'image/jpeg'
          );
        }
      } catch (err) {
        console.error('Failed to transfer report to PARA', err);
      }
    }

    await this.notificationPort.sendDirectNotification(
      report.farmer_id,
      NotificationType.DISEASE_REPORT,
      title,
      body,
      report.id
    );
  }
}
