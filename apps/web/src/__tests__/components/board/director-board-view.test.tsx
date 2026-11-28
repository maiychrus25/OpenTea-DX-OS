// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DirectorBoardView } from '@/components/features/board/DirectorBoardView'
import { changeText } from '@/components/features/board/format'
import type { DirectorBoard } from '@/domain/board/views'

const full: DirectorBoard = {
  today: '2026-11-28',
  leaf: { net_kg: 95, amount_vnd: '1235000', tickets: 2, yesterday_net_kg: 85 },
  prices: { published: true, grades: [{ grade_id: 'g1', grade_name: 'Loại 1', price_vnd_per_kg: 13000 }] },
  payable: { unpaid_lines_vnd: '500000', unsettled_leaf_vnd: '2000000', unsettled_advances_vnd: '300000', total_vnd: '2200000' },
  dry_stock: {
    grades: [
      { grade: 'DINH', kg: 19 }, { grade: 'TOM_NON', kg: 0 }, { grade: 'MOC_CAU', kg: 0 }, { grade: 'BOM', kg: 4.5 }, { grade: 'CAM', kg: 0 },
    ],
    forecast_dry_kg_14d: null,
  },
  receivables: null,
  alerts: [
    { kind: 'PARCELS_IN_WITHDRAWAL', count: 2, message: '2 nương đang trong thời gian cách ly', href: '/manager/schedule' },
    { kind: 'UNPAID_LINES', count: 3, message: '3 hộ chưa nhận tiền quyết toán quá 7 ngày', href: '/manager/settlements' },
  ],
}

const receivablesFixture = {
  outstanding_vnd: '3500000',
  overdue_count: 2,
  overdue_vnd: '1200000',
  top: [
    { partner_name: 'Thương lái A', outstanding_vnd: '2000000' },
    { partner_name: 'Thương lái B', outstanding_vnd: '1500000' },
  ],
}

const failing: DirectorBoard = { today: '2026-11-28', leaf: null, prices: null, payable: null, dry_stock: null, receivables: null, alerts: null }

describe('manager board', () => {
  test('the six blocks show their values in the order of the spec', () => {
    render(<DirectorBoardView board={full} role="manager" />)
    const titles = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(titles).toEqual(['Búp thu hôm nay', 'Giá thu mua hôm nay', 'Phải trả xã viên', 'Tồn chè khô', 'Thương lái còn nợ', 'Có gì đỏ'])
    const leaf = screen.getByRole('region', { name: 'Búp thu hôm nay' })
    expect(within(leaf).getByText('95,0 kg')).toBeInTheDocument()
    expect(within(leaf).getByText('1.235.000 đ · 2 phiếu')).toBeInTheDocument()
    expect(within(leaf).getByText('+10,0 kg so với hôm qua')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Giá thu mua hôm nay' })).getByText('13.000 đ/kg')).toBeInTheDocument()
  })

  test('the payable block shows the three parts with signs and the total', () => {
    render(<DirectorBoardView board={full} role="manager" />)
    const payable = screen.getByRole('region', { name: 'Phải trả xã viên' })
    expect(within(payable).getByText('2.200.000 đ')).toBeInTheDocument()
    expect(within(payable).getByText('+ 2.000.000 đ')).toBeInTheDocument()
    expect(within(payable).getByText('− 300.000 đ')).toBeInTheDocument()
  })

  test('dry stock lists all five grades in kg, zeros included', () => {
    render(<DirectorBoardView board={full} role="manager" />)
    const stock = screen.getByRole('region', { name: 'Tồn chè khô' })
    expect(within(stock).getAllByRole('listitem')).toHaveLength(5)
    expect(within(stock).getByText('Đinh')).toBeInTheDocument()
    expect(within(stock).getByText('4,5 kg')).toBeInTheDocument()
  })

  test('the receivables block shows the outstanding, the overdue part in red, and the top partners', () => {
    render(<DirectorBoardView board={{ ...full, receivables: receivablesFixture }} role="manager" />)
    const block = screen.getByRole('region', { name: 'Thương lái còn nợ' })
    expect(within(block).getByText('3.500.000 đ')).toBeInTheDocument()
    expect(within(block).getByText('2 đơn quá hạn · 1.200.000 đ')).toHaveClass('danger')
    expect(within(block).getAllByRole('listitem')).toHaveLength(2)
    expect(within(block).getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute('href', '/manager/sales')
  })

  test('a failed receivables read shows its own state', () => {
    render(<DirectorBoardView board={{ ...full, receivables: null }} role="manager" />)
    expect(screen.getByText('Chưa tải được công nợ')).toBeInTheDocument()
  })

  test('alerts link to their pages; an empty list reads as all clear', () => {
    const { unmount } = render(<DirectorBoardView board={full} role="manager" />)
    expect(screen.getByRole('link', { name: '2 nương đang trong thời gian cách ly' })).toHaveAttribute('href', '/manager/schedule')
    unmount()
    render(<DirectorBoardView board={{ ...full, alerts: [] }} role="manager" />)
    expect(screen.getByText('Không có cảnh báo')).toBeInTheDocument()
  })

  test('an unpublished price shows the publish button, which goes to the price page', () => {
    render(<DirectorBoardView board={{ ...full, prices: { published: false, grades: [] } }} role="manager" />)
    expect(screen.getByRole('link', { name: 'Công bố giá hôm nay' })).toHaveAttribute('href', '/manager/leaf-prices')
  })

  test('each block with a null value shows its own state and the others still load', () => {
    render(<DirectorBoardView board={{ ...failing, dry_stock: { grades: [{ grade: 'DINH', kg: 5 }], forecast_dry_kg_14d: null } }} role="manager" />)
    expect(screen.getByText('Chưa tải được số liệu thu mua hôm nay.')).toBeInTheDocument()
    expect(screen.getByText('Chưa tải được giá thu mua.')).toBeInTheDocument()
    expect(screen.getByText('Chưa tải được số tiền phải trả.')).toBeInTheDocument()
    expect(screen.getByText('Chưa tải được cảnh báo.')).toBeInTheDocument()
    expect(screen.getByText('5,0 kg')).toBeInTheDocument()
  })
})

describe('accountant board', () => {
  test('shows the money blocks and the receivables, and no stock block', () => {
    render(<DirectorBoardView board={{ ...full, receivables: receivablesFixture }} role="accountant" />)
    expect(screen.getByRole('region', { name: 'Búp thu hôm nay' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Phải trả xã viên' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Thương lái còn nợ' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Thương lái còn nợ' })).getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute('href', '/accountant/sales')
    expect(screen.queryByRole('region', { name: 'Tồn chè khô' })).not.toBeInTheDocument()
  })

  test('only money alerts appear, and the price block has no publish link', () => {
    render(<DirectorBoardView board={{ ...full, prices: { published: false, grades: [] } }} role="accountant" />)
    expect(screen.queryByRole('link', { name: '2 nương đang trong thời gian cách ly' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '3 hộ chưa nhận tiền quyết toán quá 7 ngày' })).toHaveAttribute('href', '/accountant/settlements')
    expect(screen.queryByRole('link', { name: 'Công bố giá hôm nay' })).not.toBeInTheDocument()
    expect(screen.getByText('Chưa công bố giá hôm nay.')).toBeInTheDocument()
  })

  test('a manager link from an alert moves to the accountant page that exists, or to the accountant board', () => {
    const alerts = [
      { kind: 'UNPAID_LINES' as const, count: 1, message: '1 hộ chưa nhận tiền', href: '/manager/settlements/p1' },
      { kind: 'SETTLEMENT_DRAFT' as const, count: 1, message: 'Kỳ còn nháp', href: '/manager/processing' },
    ]
    render(<DirectorBoardView board={{ ...full, alerts }} role="accountant" />)
    expect(screen.getByRole('link', { name: '1 hộ chưa nhận tiền' })).toHaveAttribute('href', '/accountant/settlements/p1')
    expect(screen.getByRole('link', { name: 'Kỳ còn nháp' })).toHaveAttribute('href', '/accountant/dashboard')
  })

  test('with no money alerts the accountant sees all clear', () => {
    render(<DirectorBoardView board={{ ...full, alerts: [{ kind: 'PARCELS_IN_WITHDRAWAL', count: 1, message: 'x', href: '/manager/schedule' }] }} role="accountant" />)
    expect(screen.getByText('Không có cảnh báo')).toBeInTheDocument()
  })
})

describe('change against yesterday', () => {
  test('same, up, down, and no sales yesterday are each named', () => {
    expect(changeText(10, 10)).toBe('Bằng hôm qua')
    expect(changeText(12.5, 10)).toBe('+2,5 kg so với hôm qua')
    expect(changeText(7, 10)).toBe('−3,0 kg so với hôm qua')
    expect(changeText(4, 0)).toBe('Hôm qua chưa có phiếu')
  })
})

describe('forecast on the dry stock block', () => {
  test('the dry stock block adds the 14-day forecast line when there is one', () => {
    render(<DirectorBoardView board={{ ...full, dry_stock: { ...full.dry_stock!, forecast_dry_kg_14d: 42.5 } }} role="manager" />)
    expect(screen.getByText('Dự kiến 14 ngày tới: 42,5 kg chè khô')).toBeInTheDocument()
  })

  test('no forecast means no line', () => {
    render(<DirectorBoardView board={{ ...full, dry_stock: { ...full.dry_stock!, forecast_dry_kg_14d: null } }} role="manager" />)
    expect(screen.queryByText(/Dự kiến 14 ngày tới/)).not.toBeInTheDocument()
  })
})
