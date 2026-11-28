// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import OpenAI from 'openai'
// TODO(issue-239): Done replacing Prisma with Ports
import { MarketDataPort } from '@/domain/ports/market-data-port'
import { ChatHistoryPort } from '@/domain/ports/chat-history-port'
import { logger } from '@/lib/logger'
import { CoreUnauthorizedError } from '@/domain/errors'

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

import { DocumentStoragePort, DocumentItem } from '@/domain/document/ports/document-storage.port'
import { documentRoot } from '@/domain/document/document-namespace'
import { hasAiOptOut, selectPassages, type PassageDoc } from './passages'

const AI_IGNORE_FILE = '.ai-ignore'
const PDF_SIDECAR_SUFFIX = '.pdf.txt'
const MAX_FOLDER_DEPTH = 4
// shortcut: no per-HTX index cache, so each question re-reads the newest files; add one when the folders grow.
const MAX_DOCS = 30
// A PDF without a sidecar is extracted on its first read; a few per question keep the first answer from stalling.
const MAX_EXTRACTIONS_PER_QUESTION = 3
const MAX_UNREADABLE_LISTED = 5

export class ChatbotUseCase {
  private client: OpenAI | null = null
  private model: string

  /** getToken is only called without a Groq key: the local LLM sits behind the core gateway. */
  constructor(
    private documentStorage?: DocumentStoragePort,
    private chatHistory?: ChatHistoryPort,
    private marketData?: MarketDataPort,
    private getToken?: () => Promise<string>,
    private htxCode?: string,
    /** Text of a PDF (null when it cannot be read); given whether its `.txt` sidecar already exists. */
    private readPdf?: (key: string, sidecarExists: boolean) => Promise<string | null>
  ) {
    const groqApiKey = process.env.GROQ_API_KEY
    this.model = process.env.OLLAMA_MODEL || 'qwen2.5:0.5b'

    if (groqApiKey && groqApiKey !== 'your_groq_api_key_here') {
      // Primary: Groq cloud API (faster, requires API key)
      this.model = process.env.OLLAMA_MODEL || 'llama-3.1-8b-instant'
      this.client = new OpenAI({
        apiKey: groqApiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      })
      logger.info('ChatbotUseCase: using Groq API', { model: this.model })
    }
  }

  /** Groq client, or the gateway's local LLM authenticated as the caller. Throws when there is no token. */
  private async resolveClient(): Promise<OpenAI> {
    if (this.client) return this.client
    if (!this.getToken) throw new CoreUnauthorizedError()
    // NOTE: CPU-only mode requires a small model (<=500MB). qwen2.5:0.5b is the
    // minimum viable option — quality is limited. For production, set GROQ_API_KEY.
    return new OpenAI({
      apiKey: await this.getToken(),
      baseURL: `${process.env.CORE_GATEWAY_URL}/api/ai/llm/v1`,
    })
  }

  async execute(
    message: string,
    history: ChatMessage[],
    userId?: string,
    sessionId?: string,
    chatType: 'market' | 'technical' = 'market'
  ): Promise<ReadableStream> {
    const client = await this.resolveClient()
    const encoder = new TextEncoder()

    // Persist user message
    if (userId && sessionId && this.chatHistory) {
      await this.chatHistory.persistMessage(sessionId, userId, 'user', message, chatType)
    }

    // Fetch RAG context
    let ragContextStr = ''
    try {
      if (chatType === 'market') {
        const timeWindow = new Date()
        timeWindow.setDate(timeWindow.getDate() - 30) // Nới lỏng thành 30 ngày cho môi trường prototype

        let recentMarketData: any[] = []
        let latestFx: any = null
        
        if (this.marketData) {
          recentMarketData = await this.marketData.getRecentMarketData(timeWindow, 200)
          latestFx = await this.marketData.getLatestFxRate()
        }

        if (recentMarketData.length > 0 || latestFx) {
          ragContextStr += `\n\n--- DỮ LIỆU THỊ TRƯỜNG TRONG 30 NGÀY QUA (DÙNG ĐỂ TRẢ LỜI): ---\n`
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
        if (!this.documentStorage) {
          throw new Error('DocumentStoragePort is required for technical chatbot')
        }
        if (!this.htxCode) {
          throw new Error('An HTX is required for the technical chatbot documents')
        }
        ragContextStr += await this.technicalContext(message, this.documentStorage, documentRoot(this.htxCode))
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

      const stream = await client.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
        max_tokens: 6000,
        temperature: 0.3,
      })

      let fullReply = ''
      // Capture model name and chatHistory before entering ReadableStream callback
      // (inside start(), 'this' refers to UnderlyingDefaultSource, not class instance)
      const modelName = this.model
      const chatHistoryRepo = this.chatHistory

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
              model: modelName,
            }) + '\n'))

            controller.close()

            // Persist assistant reply (fire-and-forget)
            if (userId && sessionId && chatHistoryRepo) {
              chatHistoryRepo.persistMessage(
                sessionId,
                userId,
                'assistant',
                cleanReply,
                chatType,
                sources
              ).catch((err: unknown) => logger.error('Failed to persist chat reply', { error: err }))
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
      logger.error('LLM API error', { error: error instanceof OpenAI.APIError ? error.status : error })
      // Only the gateway path: a refused token must send the client to login. Groq keeps its generic message.
      if (!this.client && error instanceof OpenAI.APIError) {
        if (error.status === 401) throw new CoreUnauthorizedError()
        if (error.status === 429) return this.unavailableStream('Trợ lý AI đang bận. Vui lòng thử lại sau ít phút.')
      }
      return this.unavailableStream()
    }
  }

  /** The passages that match the question, from the HTX's Resources and Areas, plus a note for each unreadable PDF. */
  private async technicalContext(question: string, storage: DocumentStoragePort, root: string): Promise<string> {
    const folders = await Promise.all([`${root}Resources/`, `${root}Areas/`].map(folder => this.collectFiles(storage, folder, 0)))
    const files = folders.flat().sort((a, b) => b.uploadDate.getTime() - a.uploadDate.getTime())
    const keys = new Set(files.map(f => f.key))
    const candidates = files
      .filter(f => f.name.endsWith('.pdf') || ((f.name.endsWith('.txt') || f.name.endsWith('.md')) && !f.name.endsWith(PDF_SIDECAR_SUFFIX)))
      .slice(0, MAX_DOCS)

    let extractions = 0
    const docs: PassageDoc[] = []
    const unreadable: string[] = []
    await Promise.all(candidates.map(async file => {
      try {
        if (!file.name.endsWith('.pdf')) {
          const text = await storage.getDocumentContent(file.key)
          docs.push({ key: file.key, name: file.name, text, ai: !hasAiOptOut(text) })
          return
        }
        const sidecarExists = keys.has(`${file.key}.txt`)
        if (!this.readPdf || (!sidecarExists && extractions >= MAX_EXTRACTIONS_PER_QUESTION)) return
        if (!sidecarExists) extractions++
        const text = await this.readPdf(file.key, sidecarExists)
        if (text) docs.push({ key: file.key, name: file.name, text, ai: true })
        else unreadable.push(file.name)
      } catch (err) {
        logger.error(`Failed to read doc content ${file.key}`, { error: err })
      }
    }))

    const passages = selectPassages(question, docs)
    if (passages.length === 0 && unreadable.length === 0) return ''
    let context = `\n\n--- TÀI LIỆU KỸ THUẬT NỘI BỘ TỪ P.A.R.A (DÙNG ĐỂ TRẢ LỜI): ---\n`
    for (const p of passages) context += `\n[Tài liệu: ${p.name}]\n${p.text}\n`
    for (const name of unreadable.sort().slice(0, MAX_UNREADABLE_LISTED)) {
      context += `\n[Tài liệu: ${name}] không đọc được (PDF scan, không có lớp chữ), không dùng làm căn cứ.\n`
    }
    return `${context}\n--- KẾT THÚC TÀI LIỆU KỸ THUẬT ---\n`
  }

  /** Files under a folder and its subfolders; a folder holding a `.ai-ignore` file is left out with everything below it. */
  private async collectFiles(storage: DocumentStoragePort, folder: string, depth: number): Promise<DocumentItem[]> {
    const items = await storage.listDocuments(folder)
    if (items.some(i => !i.isDir && i.name === AI_IGNORE_FILE)) return []
    const files = items.filter(i => !i.isDir)
    if (depth >= MAX_FOLDER_DEPTH) return files
    const nested = await Promise.all(items.filter(i => i.isDir).map(i => this.collectFiles(storage, i.key, depth + 1)))
    return [...files, ...nested.flat()]
  }

  private unavailableStream(message = 'Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau hoặc xem bản tin thị trường.'): ReadableStream {
    const encoder = new TextEncoder()
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({
          error: true,
          message,
        }) + '\n'))
        controller.close()
      },
    })
  }

  static extractSources(text: string): string[] {
    const sourceLines = text.split('\n').filter(line => {
      const l = line.trim().toLowerCase();
      if (l.startsWith('nguồn:') || l.startsWith('- nguồn:')) return true;
      if (l.startsWith('- ') && (l.includes('[comtrade]') || l.includes('[wto]') || l.includes('[faostat]') || l.includes('bộ nn') || l.includes('vfa'))) return true;
      return false;
    })
    return sourceLines.map(l => l.replace(/^[-*]\s*/, '').replace(/^nguồn( tham khảo)?:\s*/i, '').trim()).filter(Boolean)
  }

  async getHistory(userId: string, sessionId: string, chatType: 'market' | 'technical' = 'market'): Promise<ChatMessage[]> {
    if (this.chatHistory) {
      return this.chatHistory.getHistory(userId, sessionId, chatType)
    }
    return []
  }

  async getSessions(userId: string, chatType: 'market' | 'technical' = 'market') {
    if (this.chatHistory) {
      return this.chatHistory.getSessions(userId, chatType)
    }
    return []
  }
}
