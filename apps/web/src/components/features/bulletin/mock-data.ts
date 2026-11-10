// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { BulletinCategory } from './BulletinCard'

export const MOCK_BULLETINS = [
  {
    id: '1',
    category: 'market' as BulletinCategory,
    headline: 'Nhu cầu chè búp khô Thái Nguyên tăng dịp cuối năm',
    summary: 'Các cơ sở thu mua tại Tân Cương và La Bằng ghi nhận đơn đặt chè Trung du, Kim Tuyên tăng trước Tết. Chè có nhật ký canh tác và mã truy xuất được ưu tiên.',
    date: 'Hôm nay, 08:30',
    sourceCount: 2,
  },
  {
    id: '2',
    category: 'weather' as BulletinCategory,
    headline: 'Cảnh báo rét đậm tại vùng chè Thái Nguyên',
    summary: 'Dự báo nhiệt độ ban đêm xuống dưới 10°C trong tuần tới. Các HTX cần theo dõi búp non và chủ động che phủ gốc chè.',
    date: 'Hôm nay, 07:15',
    sourceCount: 3,
  },
  {
    id: '3',
    category: 'technical' as BulletinCategory,
    headline: 'Khuyến cáo quản lý rầy xanh và bọ xít muỗi trên chè',
    summary: 'Phát hiện rầy xanh và bọ xít muỗi gây hại cục bộ trên búp chè. Đề nghị HTX tăng cường thăm vườn, hái đúng lứa và chỉ phun thuốc trong danh mục, tuân thủ thời gian cách ly.',
    date: 'Hôm qua, 15:00',
    sourceCount: 4,
  },
  {
    id: '4',
    category: 'market' as BulletinCategory,
    headline: 'Xuất khẩu chè Việt Nam sang Pakistan và Đài Loan tiếp tục dẫn đầu',
    summary: 'Pakistan và Đài Loan vẫn là hai thị trường nhập khẩu chè lớn của Việt Nam. Bản tin dùng số liệu xuất khẩu chè (mã HS 0902) từ UN Comtrade.',
    date: 'Hôm qua, 10:00',
    sourceCount: 3,
  },
  {
    id: '5',
    category: 'weather' as BulletinCategory,
    headline: 'Mưa lớn diện rộng dự báo tuần tới tại Thái Nguyên',
    summary: 'Đài Khí tượng Thủy văn cảnh báo mưa lớn tại Thái Nguyên trong 5 ngày tới. HTX cần khơi rãnh thoát nước cho vườn chè trên đồi.',
    date: '2 ngày trước',
    sourceCount: 2,
  },
  {
    id: '6',
    category: 'technical' as BulletinCategory,
    headline: 'Hướng dẫn bón phân sau đốn cho chè kinh doanh',
    summary: 'Khuyến cáo bón phân hữu cơ kết hợp NPK sau đốn để chè bật mầm khỏe cho lứa hái đầu năm. Ghi nhật ký bón phân để cán bộ duyệt.',
    date: '2 ngày trước',
    sourceCount: 5,
  }
]
