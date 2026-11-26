// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

// Sample reels. There is no video service yet, so nothing here leaves the browser.

export interface Reply {
  id: string
  author: string
  text: string
}

export interface ReelComment {
  id: string
  author: string
  when: string
  text: string
  likes: number
  replies: Reply[]
}

export interface Reel {
  id: string
  channel: string
  title: string
  tags: string[]
  /** English text behind "Xem bản dịch". */
  translation?: string
  when: string
  src: string
  poster?: string
  likes: number
  commentCount: number
  saves: number
  shares: number
  comments: ReelComment[]
  /** Listed under "Video của tôi". */
  mine?: boolean
  /** Posted from this browser, so it can be deleted. */
  posted?: boolean
}

const COMMENTS: [string, string, string, number, [string, string][]][] = [
  ['Hoàng Văn Sơn', '5 phút trước', 'Chè năm nay lên màu đẹp quá!', 12, [['Lò Thị Mai', 'Đúng rồi, búp đều lắm.'], ['Vừ A Páo', 'Mưa thuận nên chè tốt.']]],
  ['Lò Thị Mai', '1 giờ trước', 'Cảm ơn anh chị đã ghé thăm.', 4, []],
  ['Vừ A Páo', '2 ngày trước', 'Hẹn mùa sau ghé đồi chè.', 1, []],
]

// [clip file, channel, title, tags, translation, when, likes, comments, saves, shares, mine]
const ROWS: [number, string, string, string[], string, string, number, number, number, number, boolean][] = [
  [1, 'Về Xứ Chè', 'Đồi chè lúc bình minh, một ngày mới ở xứ chè bắt đầu', ['xứchè', 'tâncương'], 'Tea hills at dawn: a new day begins in tea country.', '2 giờ trước', 210, 23, 18, 12, false],
  [2, 'Về Xứ Chè', 'Một buổi sáng hái chè Shan tuyết', ['shantuyết'], 'A morning picking Shan Tuyet tea.', '1 ngày trước', 128, 12, 9, 4, true],
  [10, 'HTX Tân Cương', 'Cách ủ chè xanh tại hợp tác xã', ['tâncương'], 'How the cooperative withers green tea.', '2 ngày trước', 96, 8, 7, 3, true],
  [9, 'Lò Thị Mai', 'Đồi chè lúc bình minh', ['đồichè'], 'Tea hills at dawn.', '3 ngày trước', 210, 23, 11, 6, true],
  [11, 'Hoàng Văn Sơn', 'Sao chè thủ công', ['saochè'], 'Roasting tea by hand.', '4 ngày trước', 74, 5, 5, 2, true],
  [8, 'Về Xứ Chè', 'Pha trà đón khách tour', ['thưởngtrà'], 'Brewing tea to welcome tour guests.', '5 ngày trước', 150, 17, 8, 5, true],
  [3, 'Vừ A Páo', 'Thu hái đợt đầu xuân', ['mùaxuân'], 'The first harvest of spring.', '1 tuần trước', 88, 9, 4, 2, true],
]

export const SAMPLE_REELS: Reel[] = ROWS.map(([file, channel, title, tags, translation, when, likes, commentCount, saves, shares, mine]) => ({
  id: `sample-${file}`,
  channel,
  title,
  tags,
  translation,
  when,
  likes,
  commentCount,
  saves,
  shares,
  mine,
  src: `/videos/shorts/short-${file}.mp4`,
  poster: `/videos/shorts/short-${file}.jpg`,
  comments: COMMENTS.map(([author, ago, text, hearts, replies], n) => ({
    id: `sample-${file}-${n}`,
    author,
    when: ago,
    text,
    likes: hearts,
    replies: replies.map(([by, reply], r) => ({ id: `sample-${file}-${n}-${r}`, author: by, text: reply })),
  })),
}))

export function countLabel(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1).replace('.0', '').replace('.', ',')} N`
}

export function handle(channel: string): string {
  return channel.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, '')
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2)).toUpperCase()
}

export function clock(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.floor(seconds) : 0
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
