// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DocumentView } from '@/components/features/document/DocumentView'

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
