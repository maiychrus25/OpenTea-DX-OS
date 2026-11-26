// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen } from '@testing-library/react'
import Orders from '@/app/officer/orders/page'
import Order from '@/app/officer/orders/DH-0142/page'
import Products from '@/app/officer/products/page'
import Payments from '@/app/officer/payments/page'
import Tours from '@/app/officer/tours/page'
import Bookings from '@/app/officer/bookings/page'

describe('officer sample screens', () => {
  it.each([[Products, 'Sản phẩm'], [Orders, 'Đơn hàng'], [Order, 'Chi tiết đơn'], [Payments, 'Doanh thu'], [Tours, 'Tour của HTX'], [Bookings, 'Lượt đặt tour']])('renders %p', (Page, title) => {
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it('opens the detail only for the order that has one', () => {
    render(<Orders />)
    expect(screen.getAllByRole('link', { name: 'Chi tiết' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Chi tiết' })).toHaveAttribute('href', '/officer/orders/DH-0142')
  })
})
