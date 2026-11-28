/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ChatbotUseCase } from '@/application/chatbot/ChatbotUseCase'

const create = jest.fn()
jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    static APIError = class extends Error {}
    chat = { completions: { create: (...a: unknown[]) => create(...a) } }
  },
}))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }))

const env = { ...process.env }
beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...env, GROQ_API_KEY: 'gsk_test' }
  create.mockResolvedValue((async function* () {})())
})
afterAll(() => {
  process.env = env
})

type Obj = { text?: string; dir?: true; size?: number; at?: string }

/** A bucket of keys: a key ending in `/` is a folder. Listing is one level, as the MinIO adapter does it. */
function bucket(objects: Record<string, Obj>) {
  const listDocuments = jest.fn(async (prefix: string) =>
    Object.entries(objects)
      .filter(([key]) => key.startsWith(prefix) && key !== prefix)
      .flatMap(([key, o]) => {
        const rest = key.slice(prefix.length)
        const slash = rest.indexOf('/')
        if (slash === -1) return [{ name: rest, size: o.size ?? 10, uploadDate: new Date(o.at ?? '2026-11-01'), key, isDir: false }]
        const dir = `${prefix}${rest.slice(0, slash + 1)}`
        return [{ name: rest.slice(0, slash), size: 0, uploadDate: new Date('2026-11-01'), key: dir, isDir: true }]
      })
      .filter((item, i, all) => all.findIndex((x) => x.key === item.key) === i),
  )
  const getDocumentContent = jest.fn(async (key: string) => objects[key]?.text ?? '')
  return { listDocuments, getDocumentContent }
}

const ask = async (storage: ReturnType<typeof bucket>, question: string, readPdf?: (key: string, sidecar: boolean) => Promise<string | null>) => {
  const useCase = new ChatbotUseCase(storage as never, undefined, undefined, undefined, 'TC', readPdf)
  await useCase.execute(question, [], undefined, undefined, 'technical')
  return create.mock.calls[0][0].messages[0].content as string
}

const R = 'para/TC/Resources/'

describe('technical chatbot passages', () => {
  it('puts the best passages in the prompt with their file names, with or without diacritics', async () => {
    const storage = bucket({
      [`${R}cach-ly.md`]: { text: 'Thời gian cách ly thuốc trên chè là 7 ngày trước khi hái búp.' },
      [`${R}bon-phan.md`]: { text: 'Bón phân hữu cơ vào đầu mùa mưa.' },
    })
    const withMarks = await ask(storage, 'Thời gian cách ly thuốc là mấy ngày?')
    expect(withMarks).toContain('[Tài liệu: cach-ly.md]')
    expect(withMarks).toContain('7 ngày')
    expect(withMarks).not.toContain('bon-phan.md')
    create.mockClear()
    const without = await ask(storage, 'thoi gian cach ly thuoc la may ngay')
    expect(without).toBe(withMarks)
  })

  it('never shows a file whose front matter says ai: false', async () => {
    const storage = bucket({
      [`${R}thuoc.md`]: { text: '---\nai: false\n---\nBảng liều thuốc: cách ly cách ly thuốc thuốc.' },
      [`${R}ghi-chu.md`]: { text: 'Ghi chú cách ly thuốc ở nương đồi.' },
    })
    const prompt = await ask(storage, 'cách ly thuốc')
    expect(prompt).toContain('ghi-chu.md')
    expect(prompt).not.toContain('thuoc.md')
    expect(prompt).not.toContain('Bảng liều')
  })

  it('skips every file under a folder that holds a .ai-ignore file, at any depth', async () => {
    const storage = bucket({
      [`${R}open/note.md`]: { text: 'Cách ly thuốc trên chè mở.' },
      [`${R}private/.ai-ignore`]: { text: '' },
      [`${R}private/dose.md`]: { text: 'Cách ly thuốc cách ly thuốc liều riêng.' },
      [`${R}private/deep/more.md`]: { text: 'Cách ly thuốc cách ly thuốc sâu hơn.' },
    })
    const prompt = await ask(storage, 'cách ly thuốc')
    expect(prompt).toContain('note.md')
    expect(prompt).not.toContain('dose.md')
    expect(prompt).not.toContain('more.md')
  })

  it('reads a PDF through its sidecar, cites the PDF, and does not list the sidecar as a file', async () => {
    const storage = bucket({
      [`${R}quy-trinh.pdf`]: { size: 5000 },
      [`${R}quy-trinh.pdf.txt`]: { text: 'Sau khi phun thuoc Sagi doi 7 ngay cach ly.' },
    })
    const readPdf = jest.fn(async (key: string) => (await storage.getDocumentContent(`${key}.txt`)) || null)
    const prompt = await ask(storage, 'thuoc Sagi cach ly bao lau', readPdf)
    expect(prompt).toContain('[Tài liệu: quy-trinh.pdf]')
    expect(prompt).toContain('doi 7 ngay')
    expect(prompt).not.toContain('quy-trinh.pdf.txt')
    expect(readPdf).toHaveBeenCalledWith(`${R}quy-trinh.pdf`, true)
  })

  it('names the files of the passages as sources when the model writes no "Nguồn:" line', async () => {
    const storage = bucket({
      [`${R}quy-trinh.pdf`]: { size: 5000 },
      [`${R}quy-trinh.pdf.txt`]: { text: 'Sau khi phun thuoc Sagi doi 7 ngay cach ly.' },
      [`${R}lich-phun.md`]: { text: 'Sagi phun lua 2, cach ly 7 ngay.' },
    })
    create.mockResolvedValue((async function* () { yield { choices: [{ delta: { content: 'Cách ly 7 ngày.' } }] } })())
    const useCase = new ChatbotUseCase(storage as never, undefined, undefined, undefined, 'TC', async (key) => (await storage.getDocumentContent(`${key}.txt`)) || null)
    const stream = await useCase.execute('thuoc Sagi cach ly bao lau', [], undefined, undefined, 'technical')
    const lines = (await new Response(stream).text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.at(-1).sources.sort()).toEqual(['lich-phun.md', 'quy-trinh.pdf'])
  })

  it('says a scanned PDF cannot be read and puts no text from it in the prompt', async () => {
    const storage = bucket({ [`${R}scan.pdf`]: { size: 5000 } })
    const prompt = await ask(storage, 'cach ly thuoc', async () => null)
    expect(prompt).toContain('[Tài liệu: scan.pdf] không đọc được')
    expect(prompt).not.toContain('\u0000')
  })

  it('extracts a PDF that has no sidecar yet, once', async () => {
    const storage = bucket({ [`${R}new.pdf`]: { size: 5000 } })
    const readPdf = jest.fn(async () => 'Cach ly thuoc 7 ngay.')
    await ask(storage, 'cach ly thuoc', readPdf)
    expect(readPdf).toHaveBeenCalledWith(`${R}new.pdf`, false)
  })

  it('adds no document block when nothing matches the question', async () => {
    const storage = bucket({ [`${R}a.md`]: { text: 'Bón phân hữu cơ.' } })
    expect(await ask(storage, 'zzz qqq')).not.toContain('TÀI LIỆU KỸ THUẬT NỘI BỘ')
  })
})
