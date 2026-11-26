// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

// Sample clips shared with the mobile app. There is no video service yet, so nothing here leaves the browser.

export interface ShortComment {
  id: string
  author: string
  when: string
  text: string
}

export interface ShortClip {
  id: string
  channel: string
  title: string
  tags: string[]
  src: string
  poster?: string
  likes: number
  views: number
  comments: ShortComment[]
  mine?: boolean
}

const POOL: [string, string][] = [
  ['Hoàng Văn Sơn', 'Chè năm nay lên màu đẹp quá!'],
  ['Lò Thị Mai', 'Cảm ơn anh chị đã ghé thăm.'],
  ['Vừ A Páo', 'Hẹn mùa sau ghé đồi chè.'],
  ['Lan Anh', 'Đồi chè đẹp quá, cuối tuần này em lên chơi!'],
  ['Minh Tuấn', 'Nhìn là thấy thơm mùi chè mới rồi.'],
  ['Mai Phương', 'Sáng sương mù thế này đẹp thật.'],
]
const WHEN = ['5 phút', '1 giờ', '2 ngày']

// [channel, title, tags, clip file, views]
const ROWS: [string, string, string[], number, number][] = [
  ['Về Xứ Chè', 'Đồi chè lúc bình minh, một ngày mới ở xứ chè bắt đầu', ['xứchè', 'tâncương'], 1, 1890],
  ['Nông hộ Hoàng Văn Sáng', 'Hái chè sớm trên đồi', ['háichè'], 2, 3240],
  ['Nguyễn Minh An', 'Một ngày làm người hái chè', ['dulịch'], 3, 21300],
  ['Nông hộ Hoàng Văn Sáng', 'Sao chè bằng chảo gang', ['saochè'], 4, 5870],
  ['HTX Chè Tân Cương', 'Từ búp chè đến chén trà thơm', ['tâncương'], 5, 12400],
  ['HTX Chè Tân Cương', 'Một mùa chè xanh', ['mùachè'], 6, 8650],
  ['Nguyễn Minh An', 'Hành trình chè Shan Tuyết cổ thụ', ['shantuyết'], 7, 6420],
  ['HTX Chè Tân Cương', 'Trà hoa nhài mới ra lò', ['tràhoa'], 8, 4310],
  ['Nguyễn Minh An', 'Hẹn nhau trên đồi chè', ['đồichè'], 9, 9780],
  ['Nông hộ Hoàng Văn Sáng', 'Một vòng thửa chè sau mưa', ['saumưa'], 10, 1975],
  ['Nguyễn Thu Hà', 'Lần đầu tự tay sao chè', ['saochè'], 11, 412],
  ['Nguyễn Minh An', 'Thưởng trà bên bếp lửa', ['thưởngtrà'], 12, 3150],
]

export const SAMPLE_CLIPS: ShortClip[] = ROWS.map(([channel, title, tags, file, views], i) => ({
  id: `sample-${file}`,
  channel,
  title,
  tags,
  src: `/videos/shorts/short-${file}.mp4`,
  poster: `/videos/shorts/short-${file}.jpg`,
  views,
  likes: i === 0 ? 210 : Math.round(views / 9),
  comments: WHEN.map((when, n) => {
    const [author, text] = POOL[((i % 2) * 3 + n) % POOL.length]
    return { id: `sample-${file}-${n}`, author, when, text }
  }),
}))

export function countLabel(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1).replace('.0', '').replace('.', ',')} N`
}

export function handle(channel: string): string {
  return `@${channel.toLowerCase().replace(/\s+/g, '')}`
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2)).toUpperCase()
}
