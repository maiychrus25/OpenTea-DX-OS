// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { BroadcastAnnouncementUseCase } from '@/application/notification/broadcast-announcement-usecase';
import { NotificationPort } from '@/domain/ports/notification-port';

describe('Story 3.7: BroadcastAnnouncementUseCase', () => {
  let mockNotificationRepo: jest.Mocked<NotificationPort>;
  let useCase: BroadcastAnnouncementUseCase;

  beforeEach(() => {
    mockNotificationRepo = {
      getRecentByUserId: jest.fn(),
      markAsRead: jest.fn(),
      delete: jest.fn(),
      updatePreferences: jest.fn(),
      broadcastDiseaseReport: jest.fn(),
      broadcastAnnouncement: jest.fn(),
      broadcastHarvestApproved: jest.fn(),
      createNotification: jest.fn(),
      sendDirectNotification: jest.fn(),
    } as unknown as jest.Mocked<NotificationPort>;

    useCase = new BroadcastAnnouncementUseCase(mockNotificationRepo);
  });

  it('should throw an error if title is empty', async () => {
    await expect(useCase.execute('', 'Body', 'sender-1', ['user-1'])).rejects.toThrow('Title is required');
    expect(mockNotificationRepo.broadcastAnnouncement).not.toHaveBeenCalled();
  });

  it('should throw an error if body is empty', async () => {
    await expect(useCase.execute('Title', '  ', 'sender-1', ['user-1'])).rejects.toThrow('Body is required');
    expect(mockNotificationRepo.broadcastAnnouncement).not.toHaveBeenCalled();
  });

  it('should call repository to broadcast announcement', async () => {
    await useCase.execute('Khẩn cấp: Bão sắp đến', 'Xin chào bà con, bão Yagi sắp đổ bộ, xin chú ý.', 'officer-1', ['user-1']);
    expect(mockNotificationRepo.broadcastAnnouncement).toHaveBeenCalledWith(
      'Khẩn cấp: Bão sắp đến',
      'Xin chào bà con, bão Yagi sắp đổ bộ, xin chú ý.',
      'officer-1',
      ['user-1']
    );
  });
});
