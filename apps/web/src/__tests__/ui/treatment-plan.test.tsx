// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { treatmentPlan } from '@/domain/disease/treatment-plan'
import names from '../../../../../ai-models/tea_class_names_vi.json'

const text = (disease: string, advice?: string) => JSON.stringify(treatmentPlan(disease, advice))

describe('treatment plan after a diagnosis', () => {
  it('has specific care for every disease the tea model can name', () => {
    for (const { vi } of Object.values(names).filter(n => n.vi !== 'Lá khoẻ')) {
      expect([vi, treatmentPlan(vi)[0].detail.startsWith('Đánh dấu khu vực')]).toEqual([vi, false])
    }
  })

  it('never writes a product or a dose by itself, only the officer does', () => {
    for (const { vi } of Object.values(names)) {
      expect(text(vi)).not.toMatch(/\d+\s?(ml|g|lít|kg)\b|EC|WP|SC\b/)
    }
    expect(text('Bọ xít muỗi')).toContain('Chờ cán bộ kê thuốc')
    expect(text('Bọ xít muỗi', 'Phun theo hướng dẫn A')).toContain('Phun theo hướng dẫn A')
  })

  it('asks for a new photo, with no officer or medicine step, when the photo is not a tea leaf', () => {
    const plan = treatmentPlan('Không phải lá chè')
    expect(plan).toHaveLength(1)
    expect(plan[0].title).toBe('Chụp lại ảnh lá chè')
    expect(text('Không phải lá chè')).not.toMatch(/kê thuốc|phun/i)
  })

  it('treats a healthy leaf as needing no medicine', () => {
    expect(treatmentPlan('Lá khoẻ')).toHaveLength(2)
    expect(text('Lá khoẻ')).toContain('Không dùng thuốc')
  })
})
