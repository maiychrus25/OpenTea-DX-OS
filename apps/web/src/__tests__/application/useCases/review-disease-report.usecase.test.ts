// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ReviewDiseaseReportUseCase } from '@/application/disease/review-disease-report.usecase';
import { DiseaseReportPort } from '@/domain/disease/ports/disease-report.port';
import { NotificationPort } from '@/domain/ports/notification-port';
import { NotificationType } from '@prisma/client';

describe('ReviewDiseaseReportUseCase', () => {
  let useCase: ReviewDiseaseReportUseCase;
  let mockDiseasePort: jest.Mocked<DiseaseReportPort>;
  let mockNotificationPort: jest.Mocked<NotificationPort>;

  beforeEach(() => {
    mockDiseasePort = {
      save: jest.fn(),
      findLatestByParcelId: jest.fn(),
      findHistoryByFarmer: jest.fn(),
      findPendingReports: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
    };
    mockNotificationPort = {
      getRecentByUserId: jest.fn(),
      markAsRead: jest.fn(),
      delete: jest.fn(),
      updatePreferences: jest.fn(),
      broadcastDiseaseReport: jest.fn(),
      broadcastHarvestApproved: jest.fn(),
      broadcastAnnouncement: jest.fn(),
      createNotification: jest.fn(),
      sendDirectNotification: jest.fn(),
    };
    useCase = new ReviewDiseaseReportUseCase(mockDiseasePort, mockNotificationPort);
  });

  it('throws error if report not found', async () => {
    mockDiseasePort.findById.mockResolvedValue(null);

    await expect(useCase.execute({
      reportId: '123',
      officerId: 'off1',
      status: 'APPROVED',
      treatment_recommendation: 'Spray'
    })).rejects.toThrow('REPORT_NOT_FOUND');
  });

  it('throws error if status is not PENDING', async () => {
    mockDiseasePort.findById.mockResolvedValue({
      id: '123',
      status: 'APPROVED',
      // @ts-ignore
      detection_date: new Date(),
      photo_minio_key: 'key',
      ai_disease_name: 'test',
      ai_confidence: 90,
      farmer_id: 'farm1',
      farmer_name: 'Test',
      parcel_code: 'P01'
    });

    await expect(useCase.execute({
      reportId: '123',
      officerId: 'off1',
      status: 'APPROVED',
      treatment_recommendation: 'Spray'
    })).rejects.toThrow('INVALID_STATUS_TRANSITION');
  });

  it('throws error if APPROVED but no treatment', async () => {
    mockDiseasePort.findById.mockResolvedValue({
      id: '123',
      status: 'PENDING',
      // @ts-ignore
      detection_date: new Date(),
      photo_minio_key: 'key',
      ai_disease_name: 'test',
      ai_confidence: 90,
      farmer_id: 'farm1',
      farmer_name: 'Test',
      parcel_code: 'P01'
    });

    await expect(useCase.execute({
      reportId: '123',
      officerId: 'off1',
      status: 'APPROVED',
      treatment_recommendation: '  ' // empty
    })).rejects.toThrow('TREATMENT_REQUIRED');
  });

  it('approves report and sends notification', async () => {
    mockDiseasePort.findById.mockResolvedValue({
      id: '123',
      status: 'PENDING',
      farmer_id: 'farm1',
      ai_disease_name: 'Leaf blight',
      parcel_code: 'P01',
      // @ts-ignore
      detection_date: new Date(),
      photo_minio_key: 'key',
      ai_confidence: 90,
      farmer_name: 'Test',
    });

    await useCase.execute({
      reportId: '123',
      officerId: 'off1',
      status: 'APPROVED',
      treatment_recommendation: 'Spray fungicide'
    });

    expect(mockDiseasePort.updateStatus).toHaveBeenCalledWith('123', 'APPROVED', 'Spray fungicide', 'off1');
    expect(mockNotificationPort.sendDirectNotification).toHaveBeenCalledWith(
      'farm1',
      NotificationType.DISEASE_REPORT,
      'Báo cáo bệnh đã duyệt',
      'Báo cáo bệnh Leaf blight tại thửa P01 đã được cán bộ phản hồi. Hướng dẫn: Spray fungicide',
      '123'
    );
  });
});

