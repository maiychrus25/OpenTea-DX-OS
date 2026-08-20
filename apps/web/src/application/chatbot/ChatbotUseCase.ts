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
  async execute(message: string, history: ChatMessage[]): Promise<ReadableStream> {
    // TODO(issue-202): Tích hợp thực tế với backend Ollama/FastAPI
    // Hiện tại mock data stream để thoả mãn BE contract 10.2

    const reply = `Dựa trên dữ liệu thị trường mới nhất, ${message}. Lưu ý: Đây là thông tin tham khảo, không phải lời khuyên hành động.`
    const sources = ['USDA PSD 2026', 'Thị trường Gạo Việt Nam']
    const model = process.env.OLLAMA_MODEL || 'mistral'

    const encoder = new TextEncoder()
    return new ReadableStream({
      async start(controller) {
        // Stream the reply word by word
        const words = reply.split(' ')
        for (const word of words) {
          controller.enqueue(encoder.encode(JSON.stringify({ text: word + ' ' }) + '\n'))
          await new Promise(r => setTimeout(r, 50))
        }

        // Send sources and model at the end
        controller.enqueue(encoder.encode(JSON.stringify({
          sources,
          model
        }) + '\n'))
        
        controller.close()
      }
    })
  }
}
