// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { journalBatchApproveSchema } from '@/lib/validations/journal.schema'

describe('Story 3.6: Batch Journal Approval Validation', () => {
  test('journalBatchApproveSchema accepts valid input (1 to 50 entries)', () => {
    const validData = {
      entry_ids: ['entry-1', 'entry-2']
    }
    const result = journalBatchApproveSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('journalBatchApproveSchema rejects empty array', () => {
    const invalidData = {
      entry_ids: []
    }
    const result = journalBatchApproveSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.errors[0].message).toBe('Cần ít nhất 1 mục')
    }
  })

  test('journalBatchApproveSchema rejects > 50 entries', () => {
    const invalidData = {
      entry_ids: Array.from({ length: 51 }, (_, i) => `entry-${i}`)
    }
    const result = journalBatchApproveSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.errors[0].message).toBe('Tối đa 50 mục mỗi lần duyệt')
    }
  })
})
