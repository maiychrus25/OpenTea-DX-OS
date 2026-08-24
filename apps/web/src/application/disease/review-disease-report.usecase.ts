// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { DiseaseReportPort } from '@/domain/disease/ports/disease-report.port';
import { NotificationPort } from '@/domain/ports/notification-port';
import { NotificationType } from '@prisma/client';

export interface ReviewDiseaseReportCommand {
  reportId: string;
  officerId: string;
  status: 'APPROVED' | 'REJECTED';
  treatment_recommendation: string;
}

export class ReviewDiseaseReportUseCase {
  constructor(
    private diseaseReportPort: DiseaseReportPort,
    private notificationPort: NotificationPort
  ) {}

  async execute(command: ReviewDiseaseReportCommand): Promise<void> {
    const report = await this.diseaseReportPort.findById(command.reportId);
    
    if (!report) {
      throw new Error('REPORT_NOT_FOUND');
    }

    if (report.status !== 'PENDING') {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    if (command.status === 'APPROVED' && (!command.treatment_recommendation || command.treatment_recommendation.trim().length === 0)) {
      throw new Error('TREATMENT_REQUIRED');
    }

    await this.diseaseReportPort.updateStatus(
      command.reportId,
      command.status,
      command.treatment_recommendation,
      command.officerId
    );

    const title = command.status === 'APPROVED' ? 'Báo cáo bệnh đã duyệt' : 'Báo cáo bệnh bị từ chối';
    let body = `Báo cáo bệnh ${report.ai_disease_name} tại thửa ${report.parcel_code} đã được cán bộ phản hồi.`;
    
    if (command.status === 'APPROVED') {
      body += ` Hướng dẫn: ${command.treatment_recommendation}`;
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
