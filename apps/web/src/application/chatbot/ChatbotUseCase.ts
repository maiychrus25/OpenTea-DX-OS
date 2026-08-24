// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import OpenAI from 'openai'
// TODO(issue-239): Refactor to inject IChatHistoryRepository port via constructor
// Currently imports prisma directly for chat history persistence (AD-15 violation, tech debt).
// Plan: create IChatHistoryRepository in domain/repositories + PrismaChatHistoryRepository in infrastructure.
import { prisma } from '@/infrastructure/db/prisma.client'
import { logger } from '@/lib/logger'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatbotResponse {
  reply: string
  sources: string[]
  model: string
}

// AI Invariant: system prompt MUST include 4 rules
const SYSTEM_PROMPT = `Bạn là chuyên gia phân tích thị trường nông sản của Hợp tác xã.

QUY TẮC BẮT BUỘC:
1. CHỈ trình bày sự thật có trích dẫn nguồn (USDA, FAO, Bộ NN&PTNT, v.v.)
2. KHÔNG ra quyết định thay HTX
3. KHÔNG khuyến nghị hành động cụ thể (không nói "nên mua", "nên bán", "nên chờ")
4. Mọi số liệu phải kèm nguồn và ngày cập nhật

Trả lời bằng tiếng Việt. Cuối mỗi câu trả lời, liệt kê nguồn tham khảo trong dòng riêng với prefix "Nguồn:".
Nếu không có dữ liệu chính xác, nói rõ "Tôi không có dữ liệu cập nhật cho câu hỏi này."`

const TECHNICAL_SYSTEM_PROMPT = `Bạn là chuyên gia kỹ thuật canh tác nông nghiệp của Hợp tác xã.

QUY TẮC BẮT BUỘC:
1. CHỈ trình bày sự thật dựa trên tài liệu nội bộ của HTX hoặc các nguồn chính thống (Bộ NN&PTNT, v.v.)
2. KHÔNG trả lời các câu hỏi về giá cả thị trường (nếu được hỏi, hãy hướng dẫn người dùng hỏi chatbot thị trường).
3. KHÔNG khuyến nghị sử dụng các loại thuốc bảo vệ thực vật ngoài danh mục hoặc không an toàn.
4. Mọi thông tin kỹ thuật (như liều lượng, thời gian cách ly) phải trích dẫn rõ nguồn tài liệu.

Trả lời bằng tiếng Việt. Cuối mỗi câu trả lời, liệt kê nguồn tham khảo trong dòng riêng với prefix "Nguồn:".
Nếu không có dữ liệu trong tài liệu, nói rõ "Tài liệu kỹ thuật hiện tại không đề cập đến vấn đề này."`

export class ChatbotUseCase {
  private client: OpenAI | null = null
  private model: string

  constructor() {
    this.model = process.env.OLLAMA_MODEL || 'llama-3.1-8b-instant'

    const apiKey = process.env.GROQ_API_KEY
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      })
    }
  }

  async execute(
    message: string,
    history: ChatMessage[],
    userId?: string,
    sessionId?: string,
    chatType: 'market' | 'technical' = 'market'
  ): Promise<ReadableStream> {
    if (!this.client) {
      return this.unavailableStream()
    }

    const encoder = new TextEncoder()

    // Persist user message
    if (userId && sessionId) {
      await this.persistMessage(sessionId, userId, 'user', message, chatType)
    }

    // Fetch RAG context
    let ragContextStr = ''
    try {
      if (chatType === 'market') {
        const twoDaysAgo = new Date()
        twoDaysAgo.setHours(twoDaysAgo.getHours() - 48)

        const recentMarketData = await prisma.marketData.findMany({
          where: { fetched_at: { gte: twoDaysAgo } },
          orderBy: { fetched_at: 'desc' },
          take: 50,
        })
        const latestFx = await prisma.fxRate.findFirst({
          orderBy: { fetched_at: 'desc' },
        })

        if (recentMarketData.length > 0 || latestFx) {
          ragContextStr += `\n\n--- DỮ LIỆU THỊ TRƯỜNG THỰC TẾ TRONG 48H QUA (DÙNG ĐỂ TRẢ LỜI): ---\n`
          if (latestFx) {
            ragContextStr += `Tỷ giá ngoại tệ tham chiếu (so với USD, định dạng JSON): ${JSON.stringify(latestFx.rates)}\n`
          }
          recentMarketData.forEach(r => {
            ragContextStr += `- [${r.source}] ${r.commodity} - ${r.metric}: ${r.value} ${r.unit} (Thời gian: ${r.period})\n`
          })
          ragContextStr += `--- KẾT THÚC DỮ LIỆU THỊ TRƯỜNG ---\n`
        }
      } else {
        // Fetch from MinIO (Technical Chatbot)
        const { MinioDocumentAdapter } = await import('@/infrastructure/storage/minio-document.adapter')
        const adapter = new MinioDocumentAdapter()
        const docs = await adapter.listDocuments('para/')
        const textDocs = docs.filter(d => !d.isDir && (d.name.endsWith('.txt') || d.name.endsWith('.md')))
        
        // Limit to 5 most recent to avoid blowing up context window
        const latestDocs = textDocs.sort((a, b) => b.uploadDate.getTime() - a.uploadDate.getTime()).slice(0, 5)
        
        if (latestDocs.length > 0) {
          ragContextStr += `\n\n--- TÀI LIỆU KỸ THUẬT NỘI BỘ TỪ P.A.R.A (DÙNG ĐỂ TRẢ LỜI): ---\n`
          await Promise.all(latestDocs.map(async doc => {
            try {
              const content = await adapter.getDocumentContent(doc.key)
              ragContextStr += `\n[Tài liệu: ${doc.name}]\n${content.substring(0, 2000)}\n`
            } catch (err) {
              logger.error(`Failed to read doc content ${doc.key}`, { error: err })
            }
          }))
          ragContextStr += `\n--- KẾT THÚC TÀI LIỆU KỸ THUẬT ---\n`
        }
      }
    } catch (e) {
      logger.error("Failed to fetch RAG context", { error: e })
    }

    try {
      const promptToUse = chatType === 'market' ? SYSTEM_PROMPT : TECHNICAL_SYSTEM_PROMPT
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: promptToUse + ragContextStr },
        ...history.slice(-10).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: message },
      ]

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
        max_tokens: 6000,
        temperature: 0.3,
      })

      let fullReply = ''

      return new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const text = chunk.choices[0]?.delta?.content || ''
              if (text) {
                fullReply += text
                controller.enqueue(encoder.encode(JSON.stringify({ text }) + '\n'))
              }
            }

            // Remove <think> blocks before extracting sources and saving to DB
            const cleanReply = fullReply.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim()

            // Extract sources from reply (lines starting with "Nguồn:")
            const sources = ChatbotUseCase.extractSources(cleanReply)

            // Send metadata at end
            controller.enqueue(encoder.encode(JSON.stringify({
              done: true,
              sources: sources.length > 0 ? sources : ['Dữ liệu hệ thống'],
              model: process.env.OLLAMA_MODEL || 'llama-3.1-8b-instant',
            }) + '\n'))

            controller.close()

            // Persist assistant reply (fire-and-forget)
            if (userId && sessionId) {
              prisma.chatHistory.create({
                data: {
                  session_id: sessionId,
                  user_id: userId,
                  role: 'ASSISTANT',
                  content: cleanReply,
                  sources_json: sources,
                  chat_type: chatType,
                },
              }).catch(err => logger.error('Failed to persist chat reply', { error: err }))
            }
          } catch {
            controller.enqueue(encoder.encode(JSON.stringify({
              error: true,
              message: 'AI đang gặp sự cố, vui lòng thử lại sau.',
            }) + '\n'))
            controller.close()
          }
        },
      })
    } catch (error) {
      console.error("GROQ API ERROR:", error)
      return this.unavailableStream()
    }
  }

  private unavailableStream(): ReadableStream {
    const encoder = new TextEncoder()
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({
          error: true,
          message: 'Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau hoặc xem bản tin thị trường.',
        }) + '\n'))
        controller.close()
      },
    })
  }

  static extractSources(text: string): string[] {
    const sourceLines = text.split('\n').filter(line =>
      line.trim().toLowerCase().startsWith('nguồn:') ||
      line.trim().toLowerCase().startsWith('- nguồn:') ||
      line.trim().startsWith('- ') && line.includes('(') && line.includes(')')
    )
    return sourceLines.map(l => l.replace(/^[-*]\s*/, '').replace(/^nguồn:\s*/i, '').trim()).filter(Boolean)
  }

  async getHistory(userId: string, sessionId: string, chatType: 'market' | 'technical' = 'market'): Promise<ChatMessage[]> {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const records = await prisma.chatHistory.findMany({
      where: {
        user_id: userId,
        session_id: sessionId,
        chat_type: chatType,
        created_at: { gte: sevenDaysAgo },
      },
      orderBy: { created_at: 'asc' },
      take: 50,
    })

    return records.map(r => ({
      role: r.role === 'USER' ? 'user' as const : 'assistant' as const,
      content: r.content,
    }))
  }

  private async persistMessage(sessionId: string, userId: string, role: 'user' | 'assistant', content: string, chatType: 'market' | 'technical'): Promise<void> {
    try {
      await prisma.chatHistory.create({
        data: {
          session_id: sessionId,
          user_id: userId,
          role: role === 'user' ? 'USER' : 'ASSISTANT',
          content,
          chat_type: chatType,
        },
      })
    } catch (err) {
      logger.error('Failed to persist chat message', { error: err })
    }
  }
}
