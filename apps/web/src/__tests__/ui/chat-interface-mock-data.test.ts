// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { mockConversations } from '../../components/ui/chat-interface/mock-data'

describe('ChatInterface Mock Data', () => {
  it('should have valid mock messages', () => {
    expect(mockConversations.length).toBeGreaterThan(0)
    
    mockConversations.forEach(msg => {
      expect(msg).toHaveProperty('id')
      expect(msg).toHaveProperty('role')
      expect(msg).toHaveProperty('content')
      expect(['user', 'assistant']).toContain(msg.role)
      expect(typeof msg.content).toBe('string')
    })
  })

  it('should have sources array in assistant messages', () => {
    const assistantMsgs = mockConversations.filter(m => m.role === 'assistant')
    expect(assistantMsgs.length).toBeGreaterThan(0)
    
    assistantMsgs.forEach(msg => {
      expect(msg.sources).toBeDefined()
      expect(Array.isArray(msg.sources)).toBe(true)
      expect(msg.sources!.length).toBeGreaterThan(0)
    })
  })

  it('should have valid chart data with at least 3 items', () => {
    const chartMsg = mockConversations.find(m => m.chartData)
    expect(chartMsg).toBeDefined()
    expect(chartMsg!.chartData!.length).toBeGreaterThanOrEqual(3)
  })
})
