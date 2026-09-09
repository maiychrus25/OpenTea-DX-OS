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
    content: 'Giá lúa gạo hôm nay thế nào?',
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Theo cập nhật mới nhất, giá lúa Thu Đông đang có xu hướng tăng nhẹ. Lúa IR50404 đạt mức 8.200 - 8.400 đ/kg. Lúa OM18 đạt mức 8.500 - 8.700 đ/kg.\n\nBiểu đồ giá lúa 5 ngày qua:',
    sources: ['Sở NN&PTNT Đồng Tháp', 'Hiệp hội Lương thực VN (VFA)'],
    chartData: [8200, 8250, 8300, 8350, 8400],
  },
]
