// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  chartData?: number[]
}

export const mockConversations: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Giá chè búp khô hôm nay thế nào?',
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Theo cập nhật mới nhất, giá chè búp khô Thái Nguyên (giá mô phỏng) có xu hướng tăng nhẹ, khoảng 196.000 - 204.000 đ/kg.\n\nBiểu đồ giá mô phỏng 5 ngày qua:',
    sources: ['Mô phỏng (Toàn quốc)'],
    chartData: [196000, 198000, 200000, 202000, 204000],
  },
]
