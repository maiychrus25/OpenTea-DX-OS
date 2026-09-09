// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Sprout, BookOpen, PackageCheck, Users } from 'lucide-react'

export interface OfficerMetric {
  id: string
  label: string
  value: string | number
  detail: string
  icon: React.ReactNode
  tone: 'green' | 'amber' | 'blue' | 'neutral'
}

export const MOCK_OFFICER_METRICS: OfficerMetric[] = [
  {
    id: 'm1',
    label: 'Thửa cần chú ý',
    value: '05',
    detail: '2 bệnh - 3 thiếu nhật ký',
    icon: <Sprout />,
    tone: 'amber'
  },
  {
    id: 'm2',
    label: 'Chờ duyệt',
    value: '12',
    detail: 'Từ 7 nông hộ',
    icon: <BookOpen />,
    tone: 'amber'
  },
  {
    id: 'm3',
    label: 'Nghiệm thu',
    value: '04',
    detail: 'Trước 16:30 hôm nay',
    icon: <PackageCheck />,
    tone: 'blue'
  },
  {
    id: 'm4',
    label: 'Hộ đã cập nhật',
    value: '14/18',
    detail: 'Tiến độ 78%',
    icon: <Users />,
    tone: 'green'
  }
]

export interface TaskSchedule {
  id: string
  time: string
  task: string
  target: string
  status: string
  tone: 'green' | 'amber' | 'blue' | 'neutral'
}

export const MOCK_TASK_SCHEDULE: TaskSchedule[] = [
  {
    id: 't1',
    time: '08:00 - 09:30',
    task: 'Kiểm tra thửa P-HTX-001 (Báo cáo bệnh)',
    target: 'Hộ Nguyễn Văn A',
    status: 'Đã xác nhận',
    tone: 'green'
  },
  {
    id: 't2',
    time: '10:00 - 11:30',
    task: 'Duyệt 5 nhật ký bón phân định kỳ',
    target: 'Văn phòng HTX',
    status: 'Cần xử lý',
    tone: 'amber'
  },
  {
    id: 't3',
    time: '14:00 - 16:00',
    task: 'Đánh giá an toàn thu hoạch Lô L-023',
    target: 'Hộ Lê Thị B',
    status: 'Mục chờ',
    tone: 'blue'
  }
]
