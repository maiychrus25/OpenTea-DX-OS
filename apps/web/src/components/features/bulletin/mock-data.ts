// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { BulletinCategory } from './BulletinCard'

export const MOCK_BULLETINS = [
  {
    id: '1',
    category: 'market' as BulletinCategory,
    headline: 'Giá lúa Đông Xuân 2026 duy trì mức cao kỷ lục',
    summary: 'Giá lúa tại ĐBSCL tiếp tục duy trì mức cao, đặc biệt với các giống lúa thơm chất lượng cao như Đài Thơm 8, OM 18. Dự báo giá sẽ tăng thêm 5-8% trong quý IV do nhu cầu xuất khẩu mạnh sang Philippines và Indonesia.',
    date: 'Hôm nay, 08:30',
    sourceCount: 2,
  },
  {
    id: '2',
    category: 'weather' as BulletinCategory,
    headline: 'Cảnh báo xâm nhập mặn sớm tại Sóc Trăng, Bạc Liêu',
    summary: 'Dự báo ranh mặn 4g/l có thể lấn sâu vào các cửa sông từ 40-50km trong tuần tới do triều cường. Các HTX cần chủ động tích trữ nước ngọt.',
    date: 'Hôm nay, 07:15',
    sourceCount: 3,
  },
  {
    id: '3',
    category: 'technical' as BulletinCategory,
    headline: 'Khuyến cáo quản lý bệnh rầy phấn trắng cuối vụ',
    summary: 'Phát hiện rầy phấn trắng gây hại cục bộ tại nhiều vùng. Đề nghị HTX tăng cường thăm đồng, duy trì mực nước ruộng phù hợp và phun thuốc đúng liều.',
    date: 'Hôm qua, 15:00',
    sourceCount: 4,
  },
  {
    id: '4',
    category: 'market' as BulletinCategory,
    headline: 'Xuất khẩu gạo Việt Nam tháng 8 đạt kỷ lục 800.000 tấn',
    summary: 'Theo số liệu Tổng cục Hải quan, xuất khẩu gạo tháng 8/2026 đạt khoảng 800 nghìn tấn, tăng 15% so với cùng kỳ năm trước.',
    date: 'Hôm qua, 10:00',
    sourceCount: 3,
  },
  {
    id: '5',
    category: 'weather' as BulletinCategory,
    headline: 'Mưa lớn diện rộng dự báo tuần tới tại miền Tây',
    summary: 'Đài Khí tượng Thủy văn cảnh báo mưa lớn 100-200mm tại các tỉnh An Giang, Đồng Tháp, Kiên Giang trong 5 ngày tới.',
    date: '2 ngày trước',
    sourceCount: 2,
  },
  {
    id: '6',
    category: 'technical' as BulletinCategory,
    headline: 'Hướng dẫn bón phân giai đoạn đẻ nhánh cho lúa Hè Thu',
    summary: 'Khuyến cáo bón thúc đợt 1 (10-15 ngày sau sạ) với lượng 60-80kg Urê/ha kết hợp DAP để lúa đẻ nhánh khỏe.',
    date: '2 ngày trước',
    sourceCount: 5,
  }
]
