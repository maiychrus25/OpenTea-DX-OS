// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import Orders from '@/app/officer/orders/page'
import Order from '@/app/officer/orders/[code]/page'
import Products from '@/app/officer/products/page'
import Payments from '@/app/officer/payments/page'
import Tours from '@/app/officer/tours/page'
import Bookings from '@/app/officer/bookings/page'
import { PRODUCTS, ORDERS, TOURS, BOOKINGS, REVENUE, money, sum } from '@/components/features/officer-web/sample'

describe('officer sample screens', () => {
  it.each([[Products, 'Sản phẩm'], [Orders, 'Đơn hàng'], [() => <Order params={{ code: 'SP-03' }} />, 'Người đặt sản phẩm'], [Payments, 'Doanh thu'], [Tours, 'Tour của HTX'], [Bookings, 'Lượt đặt tour']])('renders %p', (Page, title) => {
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it.each([
    [Products, 'Tổng tồn kho', sum(PRODUCTS, p => p.stock).toLocaleString('vi-VN')],
    [Orders, 'Số lượng đã đặt', sum(ORDERS.filter(o => o.status === 'Đã đặt'), o => o.quantity).toLocaleString('vi-VN')],
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

  it('counts orders by product, one row each with its own code', () => {
    const { container } = render(<Orders />)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(PRODUCTS.length)
    expect(screen.getByText('SP-02').closest('tr')).toHaveTextContent('Chè móc câu')
    expect(screen.getByText('SP-02').closest('tr')).not.toHaveTextContent('Chè xanh Tân Cương')
    expect(screen.queryByText(/xác nhận/i)).not.toBeInTheDocument()
  })
})

describe('officer sample filters', () => {
  it('narrows the products to those nobody has ordered', () => {
    render(<Orders />)
    fireEvent.click(screen.getByRole('button', { name: 'Chưa có đơn' }))
    expect(screen.getByText('Hồng trà Shan Tuyết')).toBeInTheDocument()
    expect(screen.queryByText('Chè móc câu')).not.toBeInTheDocument()
  })
})
