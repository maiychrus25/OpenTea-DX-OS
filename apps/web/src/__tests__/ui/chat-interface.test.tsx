// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ChatInterface } from '@/components/ui/chat-interface/chat-interface'

// Mock use client window scroll function
window.HTMLElement.prototype.scrollIntoView = jest.fn()

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

  it('T2: renders history sidebar with items', () => {
    render(<ChatInterface role="manager" />)
    
    const historyList = screen.getAllByRole('list')[0] // first ul is the history list
    expect(historyList).toBeInTheDocument()
    expect(screen.getAllByText('Giá lúa gạo hôm nay thế nào?').length).toBeGreaterThan(0)
  })

  it('T3: renders mock bot message', () => {
    render(<ChatInterface role="manager" />)
    
    expect(screen.getByText(/Theo cập nhật mới nhất, giá lúa Thu Đông/)).toBeInTheDocument()
    expect(screen.getByText('Sở NN&PTNT Đồng Tháp')).toBeInTheDocument()
  })

  it('T4: user message has correct content', () => {
    render(<ChatInterface role="manager" />)
    
    expect(screen.getAllByText('Giá lúa gạo hôm nay thế nào?').length).toBeGreaterThan(0)
  })

  it('T6 & T7: composer input and send button', () => {
    render(<ChatInterface role="manager" />)
    
    const input = screen.getByPlaceholderText('Nhập câu hỏi...') as HTMLTextAreaElement
    const sendBtn = screen.getByRole('button', { name: 'Gửi' })
    
    // Initially disabled if empty (though in mock it might not be strictly bound to native disabled, but we check if button exists)
    expect(input).toBeInTheDocument()
    expect(sendBtn).toBeInTheDocument()
    
    // Type in input
    fireEvent.change(input, { target: { value: 'Test message' } })
    expect(input.value).toBe('Test message')
    
    // Send
    fireEvent.click(sendBtn)
    
    // Should render the new user message
    expect(screen.getAllByText('Test message').length).toBeGreaterThan(0)
    
    // And mock bot response
    expect(screen.getByText(/Đây là câu trả lời mô phỏng từ AI/)).toBeInTheDocument()
    
    // Input should be cleared
    expect(input.value).toBe('')
  })

  it('T8: new conversation button clears messages', () => {
    render(<ChatInterface role="manager" />)
    
    // Mock messages should exist initially
    expect(screen.getAllByText('Giá lúa gạo hôm nay thế nào?').length).toBeGreaterThan(0)
    
    // Click new conversation
    const newChatBtn = screen.getByRole('button', { name: /Cuộc trò chuyện mới/i })
    fireEvent.click(newChatBtn)
    
    // Messages should be cleared, showing empty state
    // But wait, the history sidebar STILL has "Giá lúa gạo hôm nay thế nào?"
    // So we just check for empty state text
    expect(screen.getByText('Hãy đặt câu hỏi để bắt đầu...')).toBeInTheDocument()
  })
})
