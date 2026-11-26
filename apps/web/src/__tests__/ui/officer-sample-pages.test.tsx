// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import Orders from '@/app/officer/orders/page'
import Order from '@/app/officer/orders/DH-0142/page'
import Products from '@/app/officer/products/page'
import Payments from '@/app/officer/payments/page'
import Tours from '@/app/officer/tours/page'
import Bookings from '@/app/officer/bookings/page'
import { PRODUCTS, ORDERS, TOURS, BOOKINGS, REVENUE, money, sum } from '@/components/features/officer-web/sample'

describe('officer sample screens', () => {
  it.each([[Products, 'Sản phẩm'], [Orders, 'Đơn hàng'], [Order, 'Chi tiết đơn'], [Payments, 'Doanh thu'], [Tours, 'Tour của HTX'], [Bookings, 'Lượt đặt tour']])('renders %p', (Page, title) => {
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it.each([
    [Products, 'Tổng tồn kho', sum(PRODUCTS, p => p.stock).toLocaleString('vi-VN')],
    [Orders, 'Chờ xác nhận', ORDERS.filter(o => o.status === 'Chờ xác nhận').length.toLocaleString('vi-VN')],
    [Tours, 'Khách đã đặt', sum(TOURS, t => t.booked).toLocaleString('vi-VN')],
    [Bookings, 'Giá trị đặt (không tính đã huỷ)', money(sum(BOOKINGS.filter(b => b.status === 'Đã đặt'), b => b.total))],
    [Payments, 'Tổng doanh thu', money(sum(REVENUE, r => r.total))],
  ])('derives the %s summary from its existing sample data', (Page, label, value) => {
    const { container } = render(<Page />)
    const term = screen.getByText(label, { selector: 'dt' })
    expect(term.parentElement?.querySelector('dd')).toHaveTextContent(value)
    expect(term.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelectorAll('dl.stats')).toHaveLength(1)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('opens the detail only for the order that has one', () => {
    render(<Orders />)
    expect(screen.getAllByRole('link', { name: 'Chi tiết' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Chi tiết' })).toHaveAttribute('href', '/officer/orders/DH-0142')
  })
})

describe('officer sample filters', () => {
  it('narrows the orders by status', () => {
    render(<Orders />)
    fireEvent.click(screen.getByRole('button', { name: 'Đã huỷ' }))
    expect(screen.getByText('Phạm Quốc Bảo')).toBeInTheDocument()
    expect(screen.queryByText('Nguyễn Thị Hà')).not.toBeInTheDocument()
  })
})
