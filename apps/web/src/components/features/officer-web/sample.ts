// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

// Fixed content of the shop, tour and revenue screens: there is no service behind them yet.

export type Tone = 'ok' | 'wt' | 'in' | 'bd' | 'mu'

// Names, packs, prices, stock and photos follow the mobile app's sample shop (apps/hub-mobile seed data).
export const PRODUCTS = [
  { code: 'SP-01', image: 'prod-01', name: 'Chè xanh Tân Cương đặc biệt', pack: 'Hộp 200 g', price: 180000, stock: 40 },
  { code: 'SP-02', image: 'prod-02', name: 'Chè móc câu', pack: 'Gói 100 g', price: 95000, stock: 60 },
  { code: 'SP-03', image: 'prod-03', name: 'Trà hoa nhài sấy', pack: 'Hộp 150 g', price: 130000, stock: 3 },
  { code: 'SP-04', image: 'prod-04', name: 'Shan Tuyết cổ thụ', pack: 'Hộp 250 g', price: 320000, stock: 25 },
  { code: 'SP-05', image: 'prod-05', name: 'Hồng trà Shan Tuyết', pack: 'Hộp 200 g', price: 210000, stock: 0 },
]

/** The photo of a product, by its id. */
export const productPhoto = (image: string) => `/images/officer/products/${image}.jpg`

/** One order is for one product. Goods are in stock, so it needs no approval: it is placed, or it was cancelled. */
export const ORDERS = [
  { code: 'DH-0143', product: 'SP-02', quantity: 3, name: 'Nguyễn Thị Hà', phone: '0935 111 222', address: 'Xóm Cầu Gỗ, xã Tân Cương', status: 'Đã đặt' },
  { code: 'DH-0142', product: 'SP-01', quantity: 2, name: 'Nguyễn Thị Hà', phone: '0935 111 222', address: 'Xóm Cầu Gỗ, xã Tân Cương', status: 'Đã đặt' },
  { code: 'DH-0141', product: 'SP-03', quantity: 2, name: 'Lê Văn Minh', phone: '0988 222 333', address: 'Phường Quang Trung, Thái Nguyên', status: 'Đã đặt' },
  { code: 'DH-0140', product: 'SP-04', quantity: 1, name: 'Trần Thu Hương', phone: '0912 000 111', address: 'Xã Phúc Xuân, Thái Nguyên', status: 'Đã đặt' },
  { code: 'DH-0139', product: 'SP-05', quantity: 2, name: 'Phạm Quốc Bảo', phone: '0977 444 555', address: 'Phường Thịnh Đán, Thái Nguyên', status: 'Đã huỷ' },
]

/** What each product has been ordered: cancelled orders are listed but not counted. */
export const productOrders = (product: (typeof PRODUCTS)[number]) => {
  const orders = ORDERS.filter((o) => o.product === product.code)
  const placed = orders.filter((o) => o.status === 'Đã đặt')
  const quantity = placed.reduce((total, o) => total + o.quantity, 0)
  return { orders, buyers: new Set(placed.map((o) => o.phone)).size, quantity, value: quantity * product.price }
}

export const TOURS = [
  { code: 'TB-0230', name: 'Thưởng trà trên đồi', image: '/images/officer/tour-tea-on-the-hill.jpg', date: '27/11/2026', booked: 2, seats: 25, adult: 290000, child: 190000 },
  { code: 'TB-0231', name: 'Trải nghiệm hái chè Tân Cương', image: '/images/officer/tour-picking.jpg', date: '28/11/2026', booked: 4, seats: 20, adult: 450000, child: 300000 },
  { code: 'TB-0229', name: 'Một ngày làm người nông dân chè', image: '/images/officer/tour-farmer-day.jpg', date: '30/11/2026', booked: 5, seats: 15, adult: 380000, child: 250000 },
]

export const BOOKINGS = [
  { code: 'TB-0231', guest: 'Nguyễn Văn Nam', tour: 'Trải nghiệm hái chè Tân Cương', date: '28/11/2026', people: 4, total: 1650000, status: 'Đã đặt' },
  { code: 'TB-0230', guest: 'Phạm Thị Lan', tour: 'Thưởng trà trên đồi', date: '27/11/2026', people: 2, total: 580000, status: 'Đã đặt' },
  { code: 'TB-0229', guest: 'Đỗ Minh Quân', tour: 'Một ngày làm người nông dân chè', date: '30/11/2026', people: 5, total: 1900000, status: 'Đã đặt' },
  { code: 'TB-0228', guest: 'Vũ Hải Yến', tour: 'Thưởng trà trên đồi', date: '25/11/2026', people: 3, total: 870000, status: 'Đã huỷ' },
]

export const REVENUE = [
  { date: '27/11/2026', source: 'Tour', code: 'TB-0230', total: 580000 },
  { date: '26/11/2026', source: 'Tour', code: 'TB-0229', total: 1900000 },
  { date: '25/11/2026', source: 'Gian hàng', code: 'DH-0141', total: 260000 },
  { date: '24/11/2026', source: 'Gian hàng', code: 'DH-0140', total: 320000 },
  { date: '22/11/2026', source: 'Gian hàng', code: 'DH-0138', total: 560000 },
]

/** The picture that stands for a tour wherever it is listed. */
export const tourImage = (name: string) => TOURS.find((t) => t.name === name)?.image

export const money = (value: number) => `${value.toLocaleString('vi-VN')} ₫`
export const sum = <T,>(list: T[], of: (item: T) => number) => list.reduce((total, item) => total + of(item), 0)
