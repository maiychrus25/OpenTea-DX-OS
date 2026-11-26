// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ShortsPage } from '@/components/features/shorts/ShortsPage'

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = jest.fn()
})

describe('ShortsPage', () => {
  it('likes, comments on and moves between clips', () => {
    render(<ShortsPage userName="Trần Thị Lan" />)
    fireEvent.click(screen.getByRole('button', { name: 'Thả tim' }))
    expect(screen.getByRole('button', { name: 'Thả tim' })).toHaveTextContent('211')

    fireEvent.change(screen.getByRole('textbox', { name: 'Viết bình luận' }), { target: { value: 'Đẹp quá' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bình luận' }))
    expect(screen.getByText('Bình luận · 4')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Video tiếp theo' }))
    expect(screen.getByText('@nônghộhoàngvănsáng')).toBeInTheDocument()
  })

  it('shows only followed channels under "Theo dõi"', () => {
    render(<ShortsPage userName="Trần Thị Lan" />)
    fireEvent.click(screen.getByRole('button', { name: 'Theo dõi' }))
    expect(screen.getByText(/Bạn chưa theo dõi kênh nào/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dành cho bạn' }))
    fireEvent.click(screen.getByRole('button', { name: 'Theo dõi Về Xứ Chè' }))
    fireEvent.click(screen.getByRole('button', { name: 'Theo dõi' }))
    expect(screen.getByText('@vềxứchè')).toBeInTheDocument()
  })
})
