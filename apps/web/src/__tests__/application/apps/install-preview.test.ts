/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { installPreview } from '@/application/apps/install-preview'

const base = { id: 'tea-shop', menu: [], hasPublic: false, hasDatabase: false, coreReads: [], installedOnServer: false }

describe('installPreview', () => {
  test('lists menu entries, public pages, database, core reads and the build note in order', () => {
    expect(
      installPreview(
        {
          ...base,
          menu: [
            { label: 'Cửa hàng', path: '/', roles: ['manager', 'officer'] },
            { label: 'Đơn hàng', path: '/orders', roles: ['farmer'] },
          ],
          hasPublic: true,
          hasDatabase: true,
          coreReads: ['danh sách xã viên'],
        },
        'TC',
      ),
    ).toEqual([
      'Thêm mục "Cửa hàng" cho Trưởng HTX, Cán bộ',
      'Thêm mục "Đơn hàng" cho Nông dân',
      'Mở trang công khai tại /apps/tea-shop/public/TC, ai có địa chỉ cũng xem được',
      'Tạo kho dữ liệu riêng cho ứng dụng; dữ liệu của mỗi HTX tách theo mã HTX',
      'Đọc danh sách xã viên bằng quyền của người đang dùng',
      'Lần cài đầu trên máy chủ phải dựng ứng dụng, mất vài phút',
    ])
  })

  test('says the app is already on the server when it is installed', () => {
    expect(installPreview({ ...base, installedOnServer: true }, 'TC')).toEqual(['Ứng dụng đã có trên máy chủ nên được bật ngay'])
  })

  test('an app with nothing declared gives only the last line', () => {
    expect(installPreview(base, 'TC')).toEqual(['Lần cài đầu trên máy chủ phải dựng ứng dụng, mất vài phút'])
  })
})
