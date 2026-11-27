/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { TelegramPhotoStore } from '@/infrastructure/storage/telegram-photo-store'

describe('TelegramPhotoStore', () => {
  it('deletes a photo by its key through the document adapter', async () => {
    const storage = { uploadDocument: jest.fn(), downloadDocument: jest.fn(), deleteDocument: jest.fn().mockResolvedValue(undefined) }
    await new TelegramPhotoStore(storage as never).delete('para/TC/Areas/Journal/2026/a.jpg')
    expect(storage.deleteDocument).toHaveBeenCalledWith('para/TC/Areas/Journal/2026/a.jpg')
  })
})
