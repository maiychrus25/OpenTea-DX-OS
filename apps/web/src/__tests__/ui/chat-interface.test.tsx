// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ChatInterface } from '@/components/ui/chat-interface/chat-interface'

// Mock use client window scroll function
window.HTMLElement.prototype.scrollIntoView = jest.fn()

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: { sessions: [] } }),
    body: {
      getReader: () => {
        let isDone = false;
        return {
          read: () => {
            if (!isDone) {
              isDone = true;
              return Promise.resolve({ done: false, value: new TextEncoder().encode('{"content":"Test response from bot"}') });
            }
            return Promise.resolve({ done: true });
          }
        }
      }
    }
  })
) as jest.Mock;

describe('ChatInterface', () => {
  it('T1: renders manager layout correctly', () => {
    render(<ChatInterface role="manager" />)
    
    // Check h1
    expect(screen.getByRole('heading', { name: 'Trợ lý Thị trường' })).toBeInTheDocument()
    // Check subtitle
    expect(screen.getByText('Phân tích từ USDA + WTO + Chợ đầu mối')).toBeInTheDocument()
  })

  it('T9: renders officer layout correctly', () => {
    render(<ChatInterface role="officer" />)
    
    expect(screen.getByRole('heading', { name: 'Trợ lý Kỹ thuật' })).toBeInTheDocument()
    expect(screen.getByText('Kiến thức canh tác + VietGAP + Bệnh cây')).toBeInTheDocument()
  })

  it('T2: renders empty history sidebar initially', () => {
    render(<ChatInterface role="manager" />)
    
    const historyList = screen.getAllByRole('list')[0]
    expect(historyList).toBeInTheDocument()
    expect(screen.getByText('Chưa có lịch sử trò chuyện')).toBeInTheDocument()
  })

  it('T3: renders empty state in main chat', () => {
    render(<ChatInterface role="manager" />)
    expect(screen.getByText('Hãy đặt câu hỏi để bắt đầu...')).toBeInTheDocument()
  })

  it('T6 & T7: composer input and send button calls fetch', async () => {
    render(<ChatInterface role="manager" />)
    
    const input = screen.getByPlaceholderText('Nhập câu hỏi...') as HTMLTextAreaElement
    const sendBtn = screen.getByRole('button', { name: 'Gửi' })
    
    fireEvent.change(input, { target: { value: 'Test message' } })
    expect(input.value).toBe('Test message')
    
    fireEvent.click(sendBtn)
    
    // User message should be rendered
    expect(screen.getAllByText('Test message').length).toBeGreaterThan(0)
    
    // Input should be cleared
    expect(input.value).toBe('')

    // fetch should be called
    expect(global.fetch).toHaveBeenCalled()
  })

  it('T8: new conversation button sets empty state', () => {
    render(<ChatInterface role="manager" />)
    
    const newChatBtn = screen.getByRole('button', { name: /Cuộc trò chuyện mới/i })
    fireEvent.click(newChatBtn)
    
    expect(screen.getByText('Hãy đặt câu hỏi để bắt đầu...')).toBeInTheDocument()
  })
})
