// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { MOCK_BULLETINS } from '@/components/features/bulletin/mock-data'
import { REFERENCES } from '@/components/features/articles/tea-references'

/** Real newspaper articles, linked from the news page and each example story. */
export const PRESS = [REFERENCES.winterTea, REFERENCES.vietgapValue, REFERENCES.vietgapTanCuong, REFERENCES.dongHy]

/** There is no news or price feed yet: every article, price and ranking here is example content. */
export type Category = 'market' | 'weather' | 'technical' | 'policy'

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'market', label: 'Thị trường' },
  { value: 'weather', label: 'Thời tiết' },
  { value: 'technical', label: 'Kỹ thuật' },
  { value: 'policy', label: 'Chính sách' },
]

export const IMAGES: Record<string, string> = {
  '1': '/images/officer/tour-picking.jpg',
  '2': '/images/tea-hills-mist.jpg',
  '3': '/images/handbook/ray-xanh.jpg',
  '4': '/images/officer/tour-tea-on-the-hill.jpg',
  '5': '/images/tea-hills-rain.jpg',
  '6': '/images/officer/tour-farmer-day.jpg',
}

export const NEWS = [
  ...MOCK_BULLETINS.map(item => ({ ...item, category: item.category as Category })),
  {
    id: 'policy-1',
    category: 'policy' as Category,
    headline: 'Hỗ trợ chứng nhận VietGAP cho HTX chè năm 2027',
    summary: 'Tỉnh dự kiến hỗ trợ chi phí cấp chứng nhận cho các HTX đáp ứng đủ điều kiện ghi chép nhật ký canh tác.',
    date: 'Hôm qua, 08:00',
    sourceCount: 2,
  },
]

export const FEATURED = NEWS.find(item => item.category === 'weather')!

/** Example read counts per article: the system does not count readers yet. */
export const READS: Record<string, number> = { '1': 214, '2': 356, '3': 298, '4': 97, '5': 183, '6': 241, 'policy-1': 132 }

export const OPENED_KEY = 'farmer-opened-news'

export const dayOf = (date: string) => date.split(',')[0]
export const timeOf = (date: string) => date.split(', ')[1] ?? date
export const minutes = (summary: string) => Math.max(2, Math.round(summary.length / 45))
export const label = (category: Category) => CATEGORIES.find(c => c.value === category)!.label

