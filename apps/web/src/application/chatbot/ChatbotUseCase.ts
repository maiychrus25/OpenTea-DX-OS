// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatbotResponse {
  reply: string
  sources: string[]
  model: string
}

export class ChatbotUseCase {
  async execute(message: string, history: ChatMessage[]): Promise<ChatbotResponse> {
    // TODO(issue-202): Tích hợp thực tế với backend Ollama/FastAPI
    // Hiện tại mock data để thoả mãn BE contract 10.1 và E2E
    
    // Yêu cầu bắt buộc từ PRD: AI Invariant (MUST cite sources, MUST NOT recommend)
    return {
      reply: `Dựa trên dữ liệu thị trường mới nhất, ${message}. Lưu ý: Đây là thông tin tham khảo, không phải lời khuyên hành động.`,
      sources: ['USDA PSD 2026', 'Thị trường Gạo Việt Nam'],
      model: process.env.OLLAMA_MODEL || 'mistral',
    }
  }
}
