// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Bug, Camera, ChevronLeft, ChevronRight, Download, Droplet, FileText, Leaf, Search, ShieldCheck, ShieldPlus, Sparkles, Sprout, Flower2 } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import { SampleTag } from '@/components/features/sample/SampleTag'
import styles from './handbook.module.css'

/** There is no data source yet: every article, count and message on this page is example content. */
const TOPICS = [
  { name: 'Trồng & chăm sóc', count: 12, icon: Sprout, categories: ['Chăm sóc'] },
  { name: 'Bón phân & tưới', count: 15, icon: Droplet, categories: ['Bón phân'] },
  { name: 'Phòng trị bệnh', count: 18, icon: ShieldPlus, categories: ['Sâu bệnh'] },
  { name: 'Thu hái & sơ chế', count: 10, icon: Leaf, categories: ['Thu hái'] },
  { name: 'VietGAP & ghi chép', count: 9, icon: ShieldCheck, categories: ['VietGAP'] },
  { name: 'Giống chè mới', count: 7, icon: Flower2, categories: ['Giống'] },
]

const SUGGESTIONS = ['Rầy xanh', 'Bón phân', 'Đốn chè', 'VietGAP']

const ARTICLES = [
  { title: 'Bón phân cho chè vụ đông: lượng và thời điểm', category: 'Bón phân', minutes: 6, image: '/images/tea-hills-sunrise.jpg', fresh: true },
  { title: 'Nhận biết và xử lý rầy xanh theo hướng sinh học', category: 'Sâu bệnh', minutes: 5, image: '/images/tea-hills-mist.jpg' },
  { title: 'Ghi nhật ký canh tác đúng chuẩn VietGAP', category: 'VietGAP', minutes: 4, image: '/images/officer/tour-tea-on-the-hill.jpg' },
  { title: 'Hái búp 1 tôm 2 lá: cách hái để cây ra búp đều', category: 'Thu hái', minutes: 4, image: '/images/officer/tour-picking.jpg' },
  { title: 'Cắt tỉa, đốn chè sau thu hoạch cuối vụ', category: 'Chăm sóc', minutes: 8, image: '/images/officer/tour-farmer-day.jpg' },
]

const PESTS = [
  { name: 'Rầy xanh', sign: 'Lá non quăn, mép cháy nâu.', level: 'Trung bình', tone: 'wt' },
  { name: 'Bọ xít muỗi', sign: 'Búp có chấm đen, héo đầu.', level: 'Cao', tone: 'bd' },
  { name: 'Thán thư', sign: 'Đốm nâu tròn, viền vàng.', level: 'Trung bình', tone: 'wt' },
  { name: 'Phồng lá chè', sign: 'Lá phồng, mặt dưới trắng.', level: 'Thấp', tone: 'soft' },
] as const

const SEASON: Record<number, [string, string, string]> = {
  11: ['Thu hái lứa cuối, dọn cành lá bệnh khỏi nương.', 'Bón lót phân hữu cơ, vun gốc giữ ẩm cho mùa khô.', 'Đốn tỉa nhẹ, che chắn rét cho chè non.'],
}

const DOCUMENTS = ['Quy trình VietGAP cho chè (PDF)', 'Bảng thuốc BVTV được phép 2026']

/** Lower case without Vietnamese marks, so "ray xanh" finds "Rầy xanh". */
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

export function Handbook() {
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState<string | null>(null)
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)

  const words = plain(query.trim())
  const categories = TOPICS.find(t => t.name === topic)?.categories
  const articles = ARTICLES.filter(a => (!categories || categories.includes(a.category)) && (!words || plain(`${a.title} ${a.category}`).includes(words)))
  const pests = PESTS.filter(p => !words || plain(`${p.name} ${p.sign}`).includes(words))
  const filtered = words !== '' || topic !== null
  const shown = filtered ? articles : articles.slice(0, 3)
  const [all, setAll] = useState(false)
  const showAll = () => { setQuery(''); setTopic(null); setAll(true) }

  return (
    <div className={`${kit.page} ${styles.page}`}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h1>Cẩm nang canh tác <SampleTag /></h1>
          <p>Kỹ thuật trồng, chăm sóc, phòng trừ sâu bệnh và thu hái chè, biên soạn bởi cán bộ kỹ thuật HTX</p>
        </div>
        <Link href="/farmer/ai" className={kit.btn}><Sparkles size={16} aria-hidden="true" />Hỏi AI</Link>
      </div>

      <label className={styles.search}>
        <Search size={18} aria-hidden="true" />
        <input type="search" aria-label="Tìm trong cẩm nang" placeholder="Tìm bài: rầy xanh, bón đạm, cắt tỉa…" value={query} onChange={event => setQuery(event.target.value)} />
      </label>

      <div className={styles.chips} role="group" aria-label="Gợi ý tìm kiếm">
        {SUGGESTIONS.map(word => (
          <button key={word} type="button" aria-pressed={query === word} onClick={() => setQuery(query === word ? '' : word)}>{word}</button>
        ))}
      </div>

      <div className={styles.topics} role="group" aria-label="Chủ đề">
        {TOPICS.map(({ name, count, icon: Icon }) => (
          <button key={name} type="button" className={styles.topic} aria-pressed={topic === name} onClick={() => setTopic(topic === name ? null : name)}>
            <span className={styles.topicIcon}><Icon size={22} strokeWidth={1.6} aria-hidden="true" /></span>
            <span className={styles.grow}><strong>{name}</strong><small>{count} bài</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ))}
      </div>

      <section className={kit.pn} aria-label="Việc theo mùa">
        <div className={`${kit.ph} ${styles.seasonHead}`}>
          <h2>Việc nên làm trong tháng {month}</h2>
          <span className={`${kit.tag} ${kit.soft}`}>Theo mùa</span>
          <div className={styles.months}>
            <button type="button" aria-label="Tháng trước" onClick={() => setMonth(month === 1 ? 12 : month - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
            <span>Tháng {month}</span>
            <button type="button" aria-label="Tháng sau" onClick={() => setMonth(month === 12 ? 1 : month + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
          </div>
        </div>
        {SEASON[month] ? (
          <div className={styles.season}>
            {['Đầu tháng', 'Giữa tháng', 'Cuối tháng'].map((label, index) => (
              <div key={label}><strong>{label}</strong><p>{SEASON[month][index]}</p></div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>Chưa có nội dung cho tháng {month}.</p>
        )}
      </section>

      <div className={styles.columns}>
        <section className={kit.pn} aria-label="Bài viết nổi bật">
          <div className={kit.ph}>
            <h2>{topic ?? (words ? 'Kết quả tìm bài' : 'Bài viết nổi bật')}</h2>
            <button type="button" className={styles.more} onClick={showAll}>Xem tất cả <ArrowRight size={14} aria-hidden="true" /></button>
          </div>
          {shown.length === 0 && !all ? <p className={styles.empty}>Chưa có bài phù hợp.</p> : (
            <ul className={styles.rows}>
              {(all && !filtered ? ARTICLES : shown).map(article => (
                <li key={article.title}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.photo} src={article.image} alt="" />
                  <span className={styles.grow}><strong>{article.title}</strong><small>{article.category} · đọc {article.minutes} phút</small></span>
                  {article.fresh && <span className={`${kit.tag} ${kit.soft}`}>Mới</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={kit.pn} aria-label="Nhận biết sâu bệnh">
          <div className={kit.ph}>
            <h2>Nhận biết sâu bệnh</h2>
            <Link href="/farmer/diagnosis" className={styles.more}><Camera size={14} aria-hidden="true" />Chụp lá để chẩn đoán</Link>
          </div>
          {pests.length === 0 ? <p className={styles.empty}>Không có sâu bệnh nào khớp.</p> : (
            <ul className={styles.rows}>
              {pests.map(pest => (
                <li key={pest.name}>
                  <span className={styles.pestIcon}><Bug size={22} strokeWidth={1.6} aria-hidden="true" /></span>
                  <span className={styles.grow}><strong>{pest.name}</strong><small>{pest.sign}</small></span>
                  <span className={`${kit.tag} ${kit[pest.tone]}`}>{pest.level}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={kit.pn} aria-label="Tài liệu tải về">
        <div className={kit.ph}><h2>Tài liệu tải về</h2></div>
        <ul className={styles.rows}>
          {DOCUMENTS.map(name => (
            <li key={name}><FileText size={18} aria-hidden="true" /><span className={styles.grow}>{name}</span><Download size={16} aria-hidden="true" /></li>
          ))}
        </ul>
      </section>
    </div>
  )
}
