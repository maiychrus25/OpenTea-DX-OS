// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

// Fixed content of the shop, tour and revenue screens: there is no service behind them yet.

export type Tone = 'ok' | 'wt' | 'in' | 'bd' | 'mu'

export const PRODUCTS = [
  { image: 'art-1', name: 'Chè Shan tuyết búp', pack: 'Hộp 100 g', price: 185000, stock: 48 },
  { image: 'art-2', name: 'Chè xanh Tân Cương', pack: 'Gói 200 g', price: 120000, stock: 132 },
  { image: 'art-3', name: 'Trà Kim Tuyên', pack: 'Hộp 150 g', price: 165000, stock: 0 },
  { image: 'art-4', name: 'Chè Bát Tiên', pack: 'Hộp 100 g', price: 210000, stock: 21 },
]

/** Goods are in stock, so an order needs no approval: it is placed, or it was cancelled. */
export const ORDERS = [
  { code: 'DH-0142', name: 'Nguyễn Thị Hà', phone: '0935 111 222', address: 'Xóm Cầu Gỗ, xã Tân Cương', status: 'Đã đặt', items: [{ image: 'art-1', quantity: 2 }, { image: 'art-2', quantity: 3 }] },
  { code: 'DH-0141', name: 'Lê Văn Minh', phone: '0988 222 333', address: 'Phường Quang Trung, Thái Nguyên', status: 'Đã đặt', items: [{ image: 'art-3', quantity: 2 }] },
  { code: 'DH-0140', name: 'Trần Thu Hương', phone: '0912 000 111', address: 'Xã Phúc Xuân, Thái Nguyên', status: 'Đã đặt', items: [{ image: 'art-1', quantity: 1 }] },
  { code: 'DH-0139', name: 'Phạm Quốc Bảo', phone: '0977 444 555', address: 'Phường Thịnh Đán, Thái Nguyên', status: 'Đã huỷ', items: [{ image: 'art-4', quantity: 2 }] },
]

export type Order = (typeof ORDERS)[number]

/** What was bought, with the product behind each line. */
export const orderLines = (order: Order) => order.items.map((item) => ({ product: PRODUCTS.find((p) => p.image === item.image)!, quantity: item.quantity }))
export const orderTotal = (order: Order) => orderLines(order).reduce((total, line) => total + line.quantity * line.product.price, 0)

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
  { date: '25/11/2026', source: 'Gian hàng', code: 'DH-0141', total: 330000 },
  { date: '24/11/2026', source: 'Gian hàng', code: 'DH-0140', total: 185000 },
  { date: '22/11/2026', source: 'Gian hàng', code: 'DH-0138', total: 560000 },
]

/** The picture that stands for a tour wherever it is listed. */
export const tourImage = (name: string) => TOURS.find((t) => t.name === name)?.image

export const money = (value: number) => `${value.toLocaleString('vi-VN')} ₫`
export const sum = <T,>(list: T[], of: (item: T) => number) => list.reduce((total, item) => total + of(item), 0)
