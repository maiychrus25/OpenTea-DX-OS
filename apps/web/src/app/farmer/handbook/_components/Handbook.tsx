// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Camera, ExternalLink, ChevronLeft, ChevronRight, Download, Droplet, FileText, Leaf, Search, ShieldCheck, ShieldPlus, Sprout, Flower2, BookOpen } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import styles from './handbook.module.css'
import { REFERENCES } from '@/components/features/articles/tea-references'

/** Articles and documents link to real sources; the season notes come from the list below. */
const TOPICS = [
  { name: 'Trồng & chăm sóc', icon: Sprout, categories: ['Chăm sóc'] },
  { name: 'Bón phân & tưới', icon: Droplet, categories: ['Bón phân'] },
  { name: 'Phòng trị bệnh', icon: ShieldPlus, categories: ['Sâu bệnh'] },
  { name: 'Thu hái & sơ chế', icon: Leaf, categories: ['Thu hái'] },
  { name: 'VietGAP & ghi chép', icon: ShieldCheck, categories: ['VietGAP'] },
  { name: 'Giống chè mới', icon: Flower2, categories: ['Giống'] },
]

const SUGGESTIONS = ['Rầy xanh', 'Bón phân', 'Đốn chè', 'VietGAP']

const ARTICLES = [
  { ...REFERENCES.winterTea, category: 'Bón phân', image: '/images/tea-hills-sunrise.jpg' },
  { ...REFERENCES.sustainable, category: 'Chăm sóc', image: '/images/officer/tour-farmer-day.jpg' },
  { ...REFERENCES.vietgapValue, category: 'VietGAP', image: '/images/officer/tour-tea-on-the-hill.jpg' },
  { ...REFERENCES.leafhopper, category: 'Sâu bệnh', image: '/images/tea-hills-mist.jpg' },
  { ...REFERENCES.blightPatch, category: 'Sâu bệnh', image: '/images/officer/tour-picking.jpg' },
]

const PESTS = [
  { name: 'Rầy xanh', url: REFERENCES.leafhopper.url, image: '/images/handbook/ray-xanh.jpg', sign: 'Lá non quăn, mép cháy nâu.' },
  { name: 'Bọ xít muỗi', url: REFERENCES.mosquitoBug.url, image: '/images/handbook/bo-xit-muoi.jpg', sign: 'Búp có chấm đen, héo đầu.' },
  { name: 'Thán thư', image: '/images/handbook/than-thu.jpg', sign: 'Đốm nâu tròn, viền vàng.' },
  { name: 'Phồng lá chè', url: REFERENCES.blister.url, image: '/images/handbook/phong-la.jpg', sign: 'Lá phồng, mặt dưới trắng.' },
] as const

const SEASON: Record<number, [string, string, string]> = {
  11: ['Thu hái lứa cuối, dọn cành lá bệnh khỏi nương.', 'Bón lót phân hữu cơ, vun gốc giữ ẩm cho mùa khô.', 'Đốn tỉa nhẹ, che chắn rét cho chè non.'],
}

const DOCUMENTS = [REFERENCES.sustainable, REFERENCES.blister, REFERENCES.blightPatch]

/** Lower case without Vietnamese marks, so "ray xanh" finds "Rầy xanh". */
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

export function Handbook() {
  const thisMonth = new Date().getMonth() + 1
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState<string | null>(null)
  const [month, setMonth] = useState(thisMonth)

  const words = plain(query.trim())
  const categories = TOPICS.find(t => t.name === topic)?.categories
  const articles = ARTICLES.filter(a => (!categories || categories.includes(a.category)) && (!words || plain(`${a.title} ${a.category} ${a.source}`).includes(words)))
  const pests = PESTS.filter(p => !words || plain(`${p.name} ${p.sign}`).includes(words))
  const filtered = words !== '' || topic !== null
  const shown = filtered ? articles : articles.slice(0, 3)
  const [all, setAll] = useState(false)
  const showAll = () => { setQuery(''); setTopic(null); setAll(true) }

  return (
    <div className={`${kit.page} ${styles.page}`}>
      <div className={kit.hd}>
        <span className={kit.hico}><BookOpen size={28} aria-hidden="true" /></span>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Cẩm nang canh tác</h1>
          <p className={kit.sub}>Kỹ thuật trồng, chăm sóc, phòng trừ sâu bệnh và thu hái chè. Tổng hợp từ tài liệu của cơ quan bảo vệ thực vật và các tạp chí khoa học (nguồn ghi ở từng bài).</p>
        </div>
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
        {TOPICS.map(({ name, categories, icon: Icon }) => (
          <button key={name} type="button" className={styles.topic} aria-pressed={topic === name} onClick={() => setTopic(topic === name ? null : name)}>
            <span className={styles.topicIcon}><Icon size={22} strokeWidth={1.6} aria-hidden="true" /></span>
            <span className={styles.grow}><strong>{name}</strong><small>{ARTICLES.filter(a => categories.includes(a.category)).length} bài</small></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ))}
      </div>

      {SEASON[thisMonth] && <section className={kit.pn} aria-label="Việc theo mùa">
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
      </section>}

      <div className={styles.columns}>
        <section className={kit.pn} aria-label="Bài viết nổi bật">
          <div className={kit.ph}>
            <h2>{topic ?? (words ? 'Kết quả tìm bài' : 'Bài viết nổi bật')}</h2>
            <button type="button" className={styles.more} onClick={showAll}>Xem tất cả <ArrowRight size={14} aria-hidden="true" /></button>
          </div>
          {shown.length === 0 && !all ? <p className={styles.empty}>Chưa có bài phù hợp.</p> : (
            <ul className={styles.rows}>
              {(all && !filtered ? ARTICLES : shown).map(article => (
                <li key={article.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.photo} src={article.image} alt="" />
                  <span className={styles.grow}>
                    <a className={styles.read} href={article.url} target="_blank" rel="noopener noreferrer">{article.title}<ExternalLink size={12} aria-hidden="true" /></a>
                    <small>{article.category} · {article.source}</small>
                  </span>
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.pestPhoto} src={pest.image} alt={`Ảnh minh hoạ ${pest.name}`} />
                  <span className={styles.grow}>
                    {'url' in pest
                      ? <a className={styles.read} href={pest.url} target="_blank" rel="noopener noreferrer">{pest.name}<ExternalLink size={12} aria-hidden="true" /></a>
                      : <strong>{pest.name}</strong>}
                    <small>{pest.sign}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={kit.pn} aria-label="Tài liệu tải về">
        <div className={kit.ph}><h2>Tài liệu tải về</h2></div>
        <ul className={styles.rows}>
          {DOCUMENTS.map(doc => (
            <li key={doc.url}>
              <FileText size={18} aria-hidden="true" />
              <span className={styles.grow}><a className={styles.read} href={doc.url} target="_blank" rel="noopener noreferrer">{doc.title}</a><small>{doc.source}</small></span>
              <a href={doc.url} target="_blank" rel="noopener noreferrer" aria-label={`Mở ${doc.title}`}><Download size={16} aria-hidden="true" /></a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
