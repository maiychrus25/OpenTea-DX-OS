// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DocumentView } from '@/components/features/document/DocumentView'

const metric = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!.querySelector('dd')
const documents = [
  { key: 'para/TC/Projects/report.pdf', name: 'report.pdf', size: 1024 },
  { key: 'para/TC/Projects/notes.pdf', name: 'notes.pdf', size: 512 },
  { key: 'para/TC/Projects/folder/', name: 'folder', isDir: true },
]

const uploadButtons = () => [screen.queryByRole('button', { name: 'Tải tài liệu lên' }), screen.queryByRole('button', { name: 'Thư mục mới' })]

beforeEach(() => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ data: { documents: [] } }))) as unknown as typeof fetch
})

test('the market reports entry reads the shared folder and offers no upload', async () => {
  render(<DocumentView htxCode="TC" />)
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`/api/documents?path=${encodeURIComponent('para/TC/Projects/')}`))
  expect(uploadButtons().every(Boolean)).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'Báo cáo thị trường' }))

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`/api/documents?path=${encodeURIComponent('para/Archives/Market_Reports/')}`))
  expect(uploadButtons()).toEqual([null, null])
})

test('officer summary counts only files and folders in the current filtered result', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { documents } }) })
  render(<DocumentView htxCode="TC" variant="officer" />)
  expect(screen.queryByText('Tài liệu đang hiển thị')).not.toBeInTheDocument()
  await screen.findByText('report.pdf')
  expect(metric('Tài liệu đang hiển thị')).toHaveTextContent('2')
  expect(metric('Thư mục đang hiển thị')).toHaveTextContent('1')
  expect(global.fetch).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByPlaceholderText('Tìm tài liệu, thư mục...'), { target: { value: 'report' } })
  await waitFor(() => expect(metric('Tài liệu đang hiển thị')).toHaveTextContent('1'))
  expect(metric('Thư mục đang hiển thị')).toHaveTextContent('0')
  expect(screen.getByRole('table')).toBeInTheDocument()
})

test('default document view has no officer summary', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { documents } }) })
  render(<DocumentView htxCode="TC" />)
  await screen.findByText('report.pdf')
  expect(screen.queryByText('Tài liệu đang hiển thị')).not.toBeInTheDocument()
  expect(uploadButtons().every(Boolean)).toBe(true)
})

test('a fallback response hides totals even when another request succeeded while it was pending', async () => {
  let resolveFirst!: (value: unknown) => void
  let resolveSecond!: (value: unknown) => void
  global.fetch = jest.fn()
    .mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve }))
    .mockReturnValueOnce(new Promise(resolve => { resolveSecond = resolve }))
  render(<DocumentView htxCode="TC" variant="officer" />)
  fireEvent.change(screen.getByPlaceholderText('Tìm tài liệu, thư mục...'), { target: { value: 'report' } })
  await act(async () => { resolveFirst({ ok: true, json: async () => ({ data: { documents } }) }) })
  await act(async () => { resolveSecond({ ok: false }) })
  expect(screen.queryByText('Tài liệu đang hiển thị')).not.toBeInTheDocument()
})

test('officer summary never counts the legacy mock fallback as live data', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false })
  render(<DocumentView htxCode="TC" variant="officer" />)
  await waitFor(() => expect(screen.queryByText('Đang tải...')).not.toBeInTheDocument())
  expect(screen.queryByText('Tài liệu đang hiển thị')).not.toBeInTheDocument()
})
