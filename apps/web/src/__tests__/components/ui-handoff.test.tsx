// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AlertBar, EmptyState, HeroBanner, PageHeader, Panel, SegmentedFilter } from '@/components/ui'

it('names the page and the panel with headings and links', () => {
  render(
    <>
      <PageHeader icon={<span />} title="Lô hàng" description="Mô tả" />
      <Panel title="Nhật ký" href="/officer/journal">x</Panel>
    </>,
  )
  expect(screen.getByRole('heading', { level: 1, name: 'Lô hàng' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute('href', '/officer/journal')
})

it('renders banner actions, the warning link and the empty state', () => {
  render(
    <>
      <HeroBanner eyebrow="HTX" title="Chào" actions={[{ href: '/a', label: 'Việc chính' }]} />
      <AlertBar href="/b">Cảnh báo</AlertBar>
      <EmptyState icon={<span />} title="Chưa có lịch thu hái" />
    </>,
  )
  expect(screen.getByRole('link', { name: 'Việc chính' })).toHaveAttribute('href', '/a')
  expect(screen.getByRole('link', { name: 'Chi tiết' })).toHaveAttribute('href', '/b')
  expect(screen.getByText('Chưa có lịch thu hái')).toBeInTheDocument()
})

it('marks the selected segment and reports a new choice', () => {
  const onChange = jest.fn()
  render(
    <SegmentedFilter label="Trạng thái" value="all" onChange={onChange}
      options={[{ value: 'all', label: 'Tất cả' }, { value: 'wait', label: 'Chờ duyệt', count: 12 }]} />,
  )
  expect(screen.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Chờ duyệt · 12' }))
  expect(onChange).toHaveBeenCalledWith('wait')
})
