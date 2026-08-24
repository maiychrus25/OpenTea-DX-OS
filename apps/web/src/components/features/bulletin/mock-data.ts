// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { BulletinCategory } from './BulletinCard'

export const MOCK_BULLETINS = [
  {
    id: '1',
    category: 'market' as BulletinCategory,
    headline: 'Giá lúa Đông Xuân 2026 duy trì mức cao kỷ lục',
    summary: 'Giá lúa tại ĐBSCL tiếp tục duy trì mức cao, đặc biệt với các giống lúa thơm chất lượng cao như Đài Thơm 8, OM 18.',
    date: 'Hôm nay, 08:30',
    sourceCount: 2
  },
  {
    id: '2',
    category: 'weather' as BulletinCategory,
    headline: 'Cảnh báo xâm nhập mặn sớm tại Sóc Trăng, Bạc Liêu',
    summary: 'Dự báo ranh mặn 4g/l có thể lấn sâu vào các cửa sông từ 40-50km trong tuần tới do triều cường.',
    date: 'Hôm nay, 07:15',
    sourceCount: 3
  },
  {
    id: '3',
    category: 'technical' as BulletinCategory,
    headline: 'Khuyến cáo quản lý bệnh rầy phấn trắng cuối vụ',
    summary: 'Phát hiện rầy phấn trắng gây hại cục bộ. Đề nghị HTX tăng cường thăm đồng, duy trì mực nước ruộng phù hợp.',
    date: 'Hôm qua, 15:00',
    sourceCount: 4
  }
]
