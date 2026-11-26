// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ReelsPage } from '@/components/features/reels/ReelsPage'

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = jest.fn()
})

const show = () => render(<ReelsPage userName="Trần Thị Lan" role="officer" />)

describe('ReelsPage', () => {
  it('likes a reel and opens the comments to add and reply', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Thả tim' }))
    expect(screen.getByRole('button', { name: 'Thả tim' })).toHaveTextContent('211')
    expect(screen.queryByRole('complementary', { name: 'Bình luận' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Bình luận' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Thêm bình luận' }), { target: { value: 'Đẹp quá' } })
    fireEvent.click(screen.getByRole('button', { name: 'Đăng' }))
    expect(screen.getByRole('button', { name: 'Bình luận (24)' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '—— Xem 2 câu trả lời' }))
    expect(screen.getByText('Đúng rồi, búp đều lắm.')).toBeInTheDocument()
  })

  it('lists "Video của tôi" and plays the one chosen', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Video của tôi' }))
    expect(screen.getByRole('heading', { name: 'Video của tôi' })).toBeInTheDocument()
    expect(screen.getByText('Reels · 6')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Xem Sao chè thủ công' }))
    expect(screen.getByText('hoangvanson')).toBeInTheDocument()
  })
})
