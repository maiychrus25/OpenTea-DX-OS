// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { foldText, hasAiOptOut, selectPassages, chunkText } from '@/application/chatbot/passages'

const doc = (name: string, text: string, ai = true) => ({ key: `para/TC/Resources/${name}`, name, text, ai })

describe('foldText', () => {
  it('lowercases and drops Vietnamese diacritics, including d with stroke', () => {
    expect(foldText('Đốn Chè, Búp Lứa')).toBe('don che, bup lua')
  })
})

describe('chunkText', () => {
  it('cuts 1200 characters with 150 overlap and covers the whole text', () => {
    const text = 'a'.repeat(3000)
    const chunks = chunkText(text)
    expect(chunks.map((c) => c.length)).toEqual([1200, 1200, 900])
    expect(chunkText('short')).toEqual(['short'])
    expect(chunkText('')).toEqual([])
  })
})

describe('hasAiOptOut', () => {
  it('is true only for ai: false in the front matter', () => {
    expect(hasAiOptOut('---\ntitle: x\nai: false\n---\nbody')).toBe(true)
    expect(hasAiOptOut('---\nAI:  False \n---\nbody')).toBe(true)
    expect(hasAiOptOut('---\nai: true\n---\nbody')).toBe(false)
    expect(hasAiOptOut('no front matter\nai: false')).toBe(false)
    expect(hasAiOptOut('# T\n\n---\nai: false\n---')).toBe(false)
  })
})

describe('selectPassages', () => {
  const docs = [
    doc('cach-ly.md', 'Thời gian cách ly thuốc bảo vệ thực vật trên chè là 7 ngày trước khi hái búp.'),
    doc('bon-phan.md', 'Bón phân hữu cơ cho nương chè vào đầu mùa mưa, mỗi sào 200 kg.'),
    doc('ban-hang.md', 'Giá chè khô tăng vào dịp Tết, nên đóng gói sớm.'),
  ]

  it('returns the same top passage for a question with and without diacritics', () => {
    const withMarks = selectPassages('Thời gian cách ly thuốc là mấy ngày?', docs)
    const without = selectPassages('thoi gian cach ly thuoc la may ngay', docs)
    expect(withMarks[0].name).toBe('cach-ly.md')
    expect(without).toEqual(withMarks)
    expect(withMarks[0].score).toBeGreaterThan(0)
  })

  it('never returns a file marked ai: false', () => {
    const secret = doc('thuoc.md', 'Cách ly cách ly cách ly thuốc thuốc thuốc', false)
    const names = selectPassages('cách ly thuốc', [...docs, secret]).map((p) => p.name)
    expect(names).toContain('cach-ly.md')
    expect(names).not.toContain('thuoc.md')
  })

  it('returns at most k passages, best first, and none when nothing matches', () => {
    const many = Array.from({ length: 6 }, (_, i) => doc(`f${i}.md`, `chè cách ly ${'x '.repeat(i)}`))
    const out = selectPassages('cách ly', many)
    expect(out).toHaveLength(4)
    expect(out.map((p) => p.score)).toEqual([...out.map((p) => p.score)].sort((a, b) => b - a))
    expect(selectPassages('zzz qqq', docs)).toEqual([])
    expect(selectPassages('   ', docs)).toEqual([])
  })

  it('finds a passage deep inside a long file and keeps its source name', () => {
    const long = doc('long.txt', `${'lá chè xanh '.repeat(300)} Sâu cuốn lá phá búp non vào tháng năm. ${'bình thường '.repeat(300)}`)
    const [top] = selectPassages('sâu cuốn lá phá búp', [long, ...docs])
    expect(top.name).toBe('long.txt')
    expect(top.text).toContain('Sâu cuốn lá')
    expect(top.text.length).toBeLessThanOrEqual(1200)
  })
})
