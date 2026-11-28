// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SalesListPanel } from '@/components/features/sales/SalesListPanel'
import { NewWholesaleOrderPanel, addDays } from '@/components/features/sales/NewWholesaleOrderPanel'
import { SalesOrderDetailPanel } from '@/components/features/sales/SalesOrderDetailPanel'
import { kgTextToG, lineAmountText, parsePrice, sumVnd } from '@/lib/sales/format'

const order = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, order_no: `HTX-DH-20261128-00${id.slice(-1)}`, kind: 'WHOLESALE', source: 'CORE', external_ref: null,
  partner_id: 'p1', partner_name: 'Thương lái A', customer_name: null, ordered_on: '2026-11-20', due_on: '2026-12-20',
  status: 'CONFIRMED', total_vnd: '2250000', paid_vnd: '0', outstanding_vnd: '2250000', overdue: false, note: null,
  created_at: '2026-11-20T01:00:00Z', cancelled_at: null, cancel_reason: null,
  lines: [{ id: 'l-1', lot_id: 'lot1', lot_code: 'TC-CHE-20261128-001', net_g: 12500, pack_count: null, pack_net_g: null, price_vnd_per_kg: 180000, amount_vnd: '2250000' }],
  payments: [],
  ...overrides,
})

const receivables = {
  outstanding_vnd: '3500000', overdue_count: 1, overdue_vnd: '1200000',
  partners: [{ partner_id: 'p1', partner_name: 'Thương lái A', outstanding_vnd: '3500000', overdue_vnd: '1200000' }],
}

const sellable = [{ lot_id: 'lot1', lot_code: 'TC-CHE-20261128-001', dry_grade: 'DINH', quality_grade: null, capacity_g: 20000, remaining_g: 18000 }]

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

let calls: { url: string; method: string; body: any }[]
let responder: (url: string, method: string, body: any) => { ok: boolean; status: number; json: () => Promise<unknown> } | null
let orderPages: { data: unknown[]; next_cursor: string | null }[]

beforeEach(() => {
  calls = []
  responder = () => null
  orderPages = [{ data: [order('a1'), order('a2', { overdue: true, outstanding_vnd: '1200000' })], next_cursor: null }]
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })
    const custom = responder(url, method, body)
    if (custom) return custom
    if (url === '/api/partners') return ok({ data: [{ id: 'p1', name: 'Thương lái A' }] })
    if (url === '/api/sales/receivables') return ok({ data: receivables })
    if (url === '/api/sales/sellable-lots') return ok({ data: sellable })
    if (url.startsWith('/api/sales/orders?')) return ok(orderPages.shift() ?? { data: [], next_cursor: null })
    if (url === '/api/sales/orders' && method === 'POST') return { ok: true, status: 201, json: async () => ({ data: order('n1') }) }
    if (url === '/api/sales/orders/a1' && method === 'GET') return ok({ data: order('a1') })
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
})

describe('money and kg helpers', () => {
  test('a line amount rounds half up to whole dong, and kg turns into grams without drift', () => {
    expect(lineAmountText(12500, 180000)).toBe('2250000')
    expect(lineAmountText(333, 1001)).toBe('333')
    expect(lineAmountText(500, 1001)).toBe('501')
    expect(kgTextToG('12.5')).toBe(12500)
    expect(kgTextToG('0')).toBeNull()
    expect(kgTextToG('1.25')).toBeNull()
    expect(parsePrice('0')).toBeNull()
    expect(parsePrice('10000001')).toBeNull()
    expect(sumVnd(['2250000', '500'])).toBe('2250500')
    expect(addDays('2026-11-28', 30)).toBe('2026-12-28')
  })
})

describe('sales list', () => {
  test('the overdue chip from the board starts the list on overdue orders', async () => {
    render(<SalesListPanel basePath="/manager" initialOverdue />)
    await screen.findAllByRole('link', { name: /HTX-DH/ })
    expect(calls.some(c => c.url.startsWith('/api/sales/orders?') && c.url.includes('overdue=1'))).toBe(true)
  })

  test('orders link to their pages, overdue ones carry the tag, and the outstanding total is the receivables total', async () => {
    render(<SalesListPanel basePath="/accountant" initialOverdue={false} />)
    const link = await screen.findByRole('link', { name: 'HTX-DH-20261128-001' })
    expect(link).toHaveAttribute('href', '/accountant/sales/a1')
    expect(within(screen.getByRole('link', { name: 'HTX-DH-20261128-002' }).closest('li')!).getByText('Quá hạn')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: 'HTX-DH-20261128-001' }).closest('li')!).queryByText('Quá hạn')).not.toBeInTheDocument()
    expect(screen.getByText('Còn phải thu:').closest('p')).toHaveTextContent('Còn phải thu: 3.500.000 đ')
  })

  test('the jump link goes to the receivables section by partner', async () => {
    render(<SalesListPanel basePath="/manager" initialOverdue={false} />)
    await screen.findByRole('link', { name: 'HTX-DH-20261128-001' })
    expect(screen.getByRole('link', { name: 'Công nợ thương lái' })).toHaveAttribute('href', '#receivables')
    expect(within(screen.getByRole('region', { name: 'Công nợ thương lái' })).getByText('Thương lái A')).toBeInTheDocument()
  })

  test('the overdue chip toggles the query off', async () => {
    render(<SalesListPanel basePath="/manager" initialOverdue />)
    await screen.findAllByRole('link', { name: /HTX-DH/ })
    orderPages.push({ data: [order('a1')], next_cursor: null })
    fireEvent.click(screen.getByRole('button', { name: 'Quá hạn' }))
    await waitFor(() => expect(calls.filter(c => c.url.startsWith('/api/sales/orders?')).at(-1)!.url).not.toContain('overdue=1'))
  })

  test('a partner list refused by the server hides the filter instead of breaking the page', async () => {
    responder = (url) => (url === '/api/partners' ? { ok: false, status: 403, json: async () => ({}) } : null)
    render(<SalesListPanel basePath="/accountant" initialOverdue={false} />)
    await screen.findByRole('link', { name: 'HTX-DH-20261128-001' })
    expect(screen.queryByLabelText('Đối tác')).not.toBeInTheDocument()
  })

  test('a failed receivables read shows its own state', async () => {
    responder = (url) => (url === '/api/sales/receivables' ? { ok: false, status: 500, json: async () => ({}) } : null)
    render(<SalesListPanel basePath="/manager" initialOverdue={false} />)
    expect(await screen.findByText('Chưa tải được công nợ.')).toBeInTheDocument()
  })

  test('tải thêm appends the next page', async () => {
    orderPages = [{ data: [order('a1')], next_cursor: 'c2' }, { data: [order('a3')], next_cursor: null }]
    render(<SalesListPanel basePath="/manager" initialOverdue={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Tải thêm' }))
    expect(await screen.findByRole('link', { name: 'HTX-DH-20261128-003' })).toBeInTheDocument()
    expect(calls.some(c => c.url.includes('cursor=c2'))).toBe(true)
  })
})

describe('new wholesale order', () => {
  test('a partner and a valid due date are needed before anything is sent', async () => {
    render(<NewWholesaleOrderPanel basePath="/manager" />)
    await screen.findByRole('option', { name: /LOT|TC-CHE/ })
    fireEvent.click(screen.getByRole('button', { name: 'Lập đơn bán' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Chọn đối tác mua.')
    expect(calls.some(c => c.method === 'POST')).toBe(false)
  })

  test('the line amount and the total update as the kg and price are typed', async () => {
    render(<NewWholesaleOrderPanel basePath="/manager" />)
    await screen.findByRole('option', { name: /TC-CHE-20261128-001/ })
    fireEvent.change(screen.getByLabelText('Lô dòng 1'), { target: { value: 'lot1' } })
    fireEvent.change(screen.getByLabelText('Kg dòng 1'), { target: { value: '12.5' } })
    fireEvent.change(screen.getByLabelText('Giá dòng 1'), { target: { value: '180000' } })
    expect(screen.getByText('2.250.000 đ', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Tổng tiền:').closest('p')).toHaveTextContent('Tổng tiền: 2.250.000 đ')
  })

  test('kg above what the lot holds is flagged on the line', async () => {
    render(<NewWholesaleOrderPanel basePath="/manager" />)
    await screen.findByRole('option', { name: /TC-CHE-20261128-001/ })
    fireEvent.change(screen.getByLabelText('Lô dòng 1'), { target: { value: 'lot1' } })
    fireEvent.change(screen.getByLabelText('Kg dòng 1'), { target: { value: '20' } })
    expect(screen.getByText('Vượt tồn lô')).toBeInTheDocument()
  })

  test('the order posts kg with one decimal and the integer price, and shows the number once created', async () => {
    render(<NewWholesaleOrderPanel basePath="/manager" />)
    await screen.findByRole('option', { name: /TC-CHE-20261128-001/ })
    fireEvent.change(screen.getByLabelText('Đối tác mua'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText('Lô dòng 1'), { target: { value: 'lot1' } })
    fireEvent.change(screen.getByLabelText('Kg dòng 1'), { target: { value: '12.5' } })
    fireEvent.change(screen.getByLabelText('Giá dòng 1'), { target: { value: '180000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lập đơn bán' }))
    expect(await screen.findByText('Đã lập đơn HTX-DH-20261128-001.')).toBeInTheDocument()
    const post = calls.find(c => c.method === 'POST')!
    expect(post.body).toEqual({
      partner_id: 'p1', ordered_on: expect.any(String), due_on: expect.any(String),
      lines: [{ lot_id: 'lot1', kg: 12.5, price_vnd_per_kg: 180000 }],
    })
  })

  test('a stock refusal shows the server message and the remaining kg per lot', async () => {
    responder = (url, method) => (url === '/api/sales/orders' && method === 'POST'
      ? { ok: false, status: 409, json: async () => ({ error: { code: 'LOT_STOCK_SHORT', message: 'Lô không còn đủ chè để bán theo số kg này.', stock: [{ lot_id: 'lot1', remaining_g: 4000 }] } }) }
      : null)
    render(<NewWholesaleOrderPanel basePath="/manager" />)
    await screen.findByRole('option', { name: /TC-CHE-20261128-001/ })
    fireEvent.change(screen.getByLabelText('Đối tác mua'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText('Lô dòng 1'), { target: { value: 'lot1' } })
    fireEvent.change(screen.getByLabelText('Kg dòng 1'), { target: { value: '12.5' } })
    fireEvent.change(screen.getByLabelText('Giá dòng 1'), { target: { value: '180000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lập đơn bán' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Lô không còn đủ chè để bán theo số kg này.')
    expect(screen.getByRole('list', { name: 'Tồn còn lại của các lô' })).toHaveTextContent('TC-CHE-20261128-001 còn 4,0 kg')
  })

  test('the due date starts 30 days after the order date', async () => {
    render(<NewWholesaleOrderPanel basePath="/manager" />)
    await screen.findByRole('option', { name: /TC-CHE-20261128-001/ })
    const orderedOn = screen.getByLabelText('Ngày lập đơn') as HTMLInputElement
    const due = screen.getByLabelText('Hạn thanh toán') as HTMLInputElement
    expect(due.value).toBe(addDays(orderedOn.value, 30))
  })
})

describe('order detail', () => {
  test('the payment box starts at the outstanding amount, and a payment is posted with its date and method', async () => {
    responder = (url, method) => {
      if (url === '/api/sales/orders/a1/payments' && method === 'POST') return ok({ data: order('a1', { paid_vnd: '1000000', outstanding_vnd: '1250000' }) })
      return null
    }
    render(<SalesOrderDetailPanel orderId="a1" basePath="/accountant" canCancel={false} />)
    const amount = await screen.findByLabelText('Số tiền (đ)')
    expect(amount).toHaveValue('2250000')
    fireEvent.change(amount, { target: { value: '1000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ghi thu tiền' }))
    await waitFor(() => expect(calls.some(c => c.url.endsWith('/payments'))).toBe(true))
    const post = calls.find(c => c.url.endsWith('/payments'))!
    expect(post.body).toMatchObject({ amount_vnd: '1000000', method: 'TRANSFER' })
    expect(post.body.paid_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('an overpayment shows the server message and nothing is recorded as paid', async () => {
    responder = (url, method) => (url.endsWith('/payments') && method === 'POST'
      ? { ok: false, status: 409, json: async () => ({ error: { code: 'OVERPAYMENT' } }) }
      : null)
    render(<SalesOrderDetailPanel orderId="a1" basePath="/manager" canCancel />)
    await screen.findByLabelText('Số tiền (đ)')
    fireEvent.click(screen.getByRole('button', { name: 'Ghi thu tiền' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Số tiền ghi thu vượt quá số còn phải thu của đơn.')
  })

  test('changing the due date patches the order', async () => {
    responder = (url, method) => (url === '/api/sales/orders/a1' && method === 'PATCH' ? ok({ data: order('a1', { due_on: '2027-01-05' }) }) : null)
    render(<SalesOrderDetailPanel orderId="a1" basePath="/manager" canCancel />)
    const due = await screen.findByLabelText('Hạn mới')
    fireEvent.change(due, { target: { value: '2027-01-05' } })
    fireEvent.click(screen.getByRole('button', { name: 'Đổi hạn thanh toán' }))
    await waitFor(() => expect(calls.find(c => c.method === 'PATCH')?.body).toEqual({ due_on: '2027-01-05' }))
  })

  test('only the manager can cancel, and a reason is needed', async () => {
    const { unmount } = render(<SalesOrderDetailPanel orderId="a1" basePath="/accountant" canCancel={false} />)
    await screen.findByText('Các dòng')
    expect(screen.queryByRole('button', { name: 'Huỷ đơn' })).not.toBeInTheDocument()
    unmount()
    render(<SalesOrderDetailPanel orderId="a1" basePath="/manager" canCancel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Huỷ đơn' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập lý do huỷ từ 3 đến 200 ký tự.')
    expect(calls.some(c => c.url.endsWith('/cancel'))).toBe(false)
  })

  test('a cancel refused because of payments shows its text', async () => {
    responder = (url, method) => (url.endsWith('/cancel') && method === 'POST'
      ? { ok: false, status: 409, json: async () => ({ error: { code: 'ORDER_HAS_PAYMENTS' } }) }
      : null)
    render(<SalesOrderDetailPanel orderId="a1" basePath="/manager" canCancel />)
    fireEvent.change(await screen.findByLabelText('Lý do huỷ'), { target: { value: 'Nhầm đơn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ đơn' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Đơn đã có khoản thu tiền, không huỷ được.')
  })

  test('the delivery note is in the page and prints through the print button', async () => {
    const print = jest.fn()
    window.print = print
    render(<SalesOrderDetailPanel orderId="a1" basePath="/manager" canCancel />)
    fireEvent.click(await screen.findByRole('button', { name: 'In phiếu giao hàng' }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Phiếu giao hàng', level: 1 })).toBeInTheDocument()
  })

  test('an unknown order shows the not-found text', async () => {
    responder = (url, method) => (url === '/api/sales/orders/a1' && method === 'GET' ? { ok: false, status: 404, json: async () => ({}) } : null)
    render(<SalesOrderDetailPanel orderId="a1" basePath="/manager" canCancel />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy đơn này.')
  })
})
