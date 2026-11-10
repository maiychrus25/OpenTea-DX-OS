// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ReviewDiseaseReportUseCase } from '@/application/disease/review-disease-report.usecase';
import { DiseaseReportPort } from '@/domain/disease/ports/disease-report.port';
import { NotificationPort } from '@/domain/ports/notification-port';
import { NotificationType } from '@prisma/client';
import { StoragePort } from '@/domain/disease/ports/storage.port';
import { DocumentStoragePort } from '@/domain/document/ports/document-storage.port';
describe('ReviewDiseaseReportUseCase', () => {
  let useCase: ReviewDiseaseReportUseCase;
  let mockDiseasePort: jest.Mocked<DiseaseReportPort>;
  let mockNotificationPort: jest.Mocked<NotificationPort>;
  let mockStoragePort: jest.Mocked<StoragePort>;
  let mockDocumentStoragePort: jest.Mocked<DocumentStoragePort>;

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
    mockStoragePort = {
      uploadFile: jest.fn(),
      getPresignedUrl: jest.fn(),
      getFileBuffer: jest.fn(),
    };
    mockDocumentStoragePort = {
      generateUploadUrl: jest.fn(),
      generateDownloadUrl: jest.fn(),
      listDocuments: jest.fn(),
      getDocumentContent: jest.fn(),
      uploadDocument: jest.fn(),
    };
    useCase = new ReviewDiseaseReportUseCase(mockDiseasePort, mockNotificationPort, mockStoragePort, mockDocumentStoragePort);
  });

  it('throws error if report not found', async () => {
    mockDiseasePort.findById.mockResolvedValue(null);

    await expect(useCase.execute({
      reportId: '123',
      officerId: 'off1',
      htxCode: 'TC',
      status: 'CONFIRMED',
      treatment_recommendation: 'Spray',
      confirmed_diagnosis: 'Leaf blight'
    })).rejects.toThrow('REPORT_NOT_FOUND');
  });

  it('throws error if status is not PENDING', async () => {
    mockDiseasePort.findById.mockResolvedValue({
      id: '123',
      status: 'CONFIRMED',
      // @ts-ignore
      detection_date: new Date(),
      photo_minio_key: 'key',
      ai_disease_name: 'test',
      ai_confidence: 90,
      farmer_id: 'farm1',
      confirmed_diagnosis: null,
      farmer_name: 'Test',
      parcel_code: 'P01'
    });

    await expect(useCase.execute({
      reportId: '123',
      officerId: 'off1',
      htxCode: 'TC',
      status: 'CONFIRMED',
      treatment_recommendation: 'Spray',
      confirmed_diagnosis: 'Leaf blight'
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
      confirmed_diagnosis: null,
      farmer_name: 'Test',
      parcel_code: 'P01'
    });

    await expect(useCase.execute({
      reportId: '123',
      officerId: 'off1',
      htxCode: 'TC',
      status: 'CONFIRMED',
      treatment_recommendation: '  ', // empty
      confirmed_diagnosis: 'Leaf blight'
    })).rejects.toThrow('TREATMENT_REQUIRED');
  });

  it('approves report and sends notification', async () => {
    mockDiseasePort.findById.mockResolvedValue({
      id: '123',
      status: 'PENDING',
      farmer_id: 'farm1',
      confirmed_diagnosis: null,
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
      htxCode: 'TC',
      status: 'CONFIRMED',
      treatment_recommendation: 'Spray fungicide',
      confirmed_diagnosis: 'Leaf blight'
    });

    expect(mockDocumentStoragePort.uploadDocument.mock.calls.map(c => c[0])).toEqual([
      'para/TC/Archives/disease-report-123.md',
      'para/TC/Archives/disease-report-123.jpg',
    ]);
    expect(mockDiseasePort.updateStatus).toHaveBeenCalledWith('123', 'CONFIRMED', 'Spray fungicide', 'off1', 'Leaf blight');
    expect(mockNotificationPort.sendDirectNotification).toHaveBeenCalledWith(
      'farm1',
      NotificationType.DISEASE_REPORT,
      'Báo cáo bệnh đã duyệt',
      'Báo cáo bệnh Leaf blight tại thửa P01 đã được cán bộ phản hồi. Hướng dẫn: Spray fungicide',
      '123'
    );
  });

  describe('confirmed diagnosis', () => {
    const pending = {
      id: '123',
      status: 'PENDING',
      farmer_id: 'farm1',
      confirmed_diagnosis: null,
      ai_disease_name: 'Không xác định',
      parcel_code: 'P01',
      detection_date: new Date('2026-11-10T00:00:00Z'),
      photo_minio_key: 'key',
      ai_confidence: 0.41,
      farmer_name: 'Test',
    };
    const base = { reportId: '123', officerId: 'off1', htxCode: 'TC', treatment_recommendation: 'Cắt bỏ lá bệnh' };

    beforeEach(() => mockDiseasePort.findById.mockResolvedValue(pending));

    it.each(['', '   '])('CONFIRMED with confirmed_diagnosis %j is a validation error and stores nothing', async (name) => {
      await expect(useCase.execute({ ...base, status: 'CONFIRMED', confirmed_diagnosis: name })).rejects.toThrow('DIAGNOSIS_REQUIRED');
      expect(mockDiseasePort.updateStatus).not.toHaveBeenCalled();
      expect(mockNotificationPort.sendDirectNotification).not.toHaveBeenCalled();
    });

    it('CONFIRMED stores the confirmed name and tells the farmer that name', async () => {
      await useCase.execute({ ...base, status: 'CONFIRMED', confirmed_diagnosis: '  Đốm nâu  ' });

      expect(mockDiseasePort.updateStatus).toHaveBeenCalledWith('123', 'CONFIRMED', 'Cắt bỏ lá bệnh', 'off1', 'Đốm nâu');
      expect(mockNotificationPort.sendDirectNotification).toHaveBeenCalledWith(
        'farm1',
        NotificationType.DISEASE_REPORT,
        'Báo cáo bệnh đã duyệt',
        'Báo cáo bệnh Đốm nâu tại thửa P01 đã được cán bộ phản hồi. Hướng dẫn: Cắt bỏ lá bệnh',
        '123'
      );
      const archive = String(mockDocumentStoragePort.uploadDocument.mock.calls[0][1]);
      expect(archive).toContain('Bệnh cán bộ xác nhận: Đốm nâu');
      expect(archive).toContain('Bệnh AI chẩn đoán: Không xác định');
    });

    it('REJECTED needs no confirmed name, stores none and still notifies the farmer', async () => {
      await useCase.execute({ ...base, status: 'REJECTED', treatment_recommendation: '', confirmed_diagnosis: '' });

      expect(mockDiseasePort.updateStatus).toHaveBeenCalledWith('123', 'REJECTED', '', 'off1', null);
      expect(mockDocumentStoragePort.uploadDocument).not.toHaveBeenCalled();
      expect(mockNotificationPort.sendDirectNotification).toHaveBeenCalledWith(
        'farm1',
        NotificationType.DISEASE_REPORT,
        'Báo cáo bệnh bị từ chối',
        'Báo cáo bệnh Không xác định tại thửa P01 đã được cán bộ phản hồi.',
        '123'
      );
    });
  });
});
