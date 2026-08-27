// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export type PrivacyState = 'Chỉ mình tôi' | 'Nội bộ HTX' | 'Công khai'

export interface DocumentItem {
  id: string
  name: string
  size: number
  uploadDate: Date
  key: string
  isDir: boolean
  tags: string[]
  privacy: PrivacyState
}

export const MOCK_DOCUMENTS: DocumentItem[] = [
  {
    id: '1',
    name: 'Dự án Cà phê Hữu cơ 2026',
    size: 0,
    uploadDate: new Date('2026-08-01T10:00:00Z'),
    key: 'para/Projects/Ca-phe-huu-co-2026/',
    isDir: true,
    tags: ['dự án', 'hữu cơ'],
    privacy: 'Nội bộ HTX'
  },
  {
    id: '2',
    name: 'Ke-hoach-san-xuat.pdf',
    size: 2048576, // 2MB
    uploadDate: new Date('2026-08-10T14:30:00Z'),
    key: 'para/Projects/Ca-phe-huu-co-2026/Ke-hoach-san-xuat.pdf',
    isDir: false,
    tags: ['kế hoạch', 'quan trọng'],
    privacy: 'Nội bộ HTX'
  },
  {
    id: '3',
    name: 'Quy-trinh-bon-phan.docx',
    size: 512000, // 500KB
    uploadDate: new Date('2026-08-15T09:15:00Z'),
    key: 'para/Projects/Ca-phe-huu-co-2026/Quy-trinh-bon-phan.docx',
    isDir: false,
    tags: ['quy trình', 'bón phân'],
    privacy: 'Chỉ mình tôi'
  },
  {
    id: '4',
    name: 'Tai-lieu-tap-huan.pdf',
    size: 15728640, // 15MB
    uploadDate: new Date('2026-07-20T08:00:00Z'),
    key: 'para/Resources/Tai-lieu-tap-huan.pdf',
    isDir: false,
    tags: ['tập huấn', 'tài liệu'],
    privacy: 'Công khai'
  },
  {
    id: '5',
    name: 'Quy-dinh-VietGAP.pdf',
    size: 8388608, // 8MB
    uploadDate: new Date('2026-06-10T11:20:00Z'),
    key: 'para/Resources/Quy-dinh-VietGAP.pdf',
    isDir: false,
    tags: ['quy định', 'vietgap'],
    privacy: 'Nội bộ HTX'
  }
]
