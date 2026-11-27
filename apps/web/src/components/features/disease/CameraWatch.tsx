// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Check, Flag, Phone, Sparkles } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import { SampleTag } from '@/components/features/sample/SampleTag'
import { CAMERAS, DETECTIONS } from './sample-detections'
import styles from './camera-watch.module.css'

const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'open', label: 'Cần xử lý' },
  { value: 'closed', label: 'Đã xử lý' },
] as const

/** The camera watch as designed. Everything in it is example data: there are no cameras yet. */
export function CameraWatch() {
  const [camera, setCamera] = useState<number | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all')
  const [selectedId, setSelectedId] = useState(DETECTIONS[0].id)

  const list = DETECTIONS.filter(d => (filter === 'all' || d.open === (filter === 'open')) && (camera === null || d.camera === camera))
  const selected = list.find(d => d.id === selectedId) ?? list[0] ?? null

  return (
    <>
      <p className={styles.warning}><SampleTag />HTX chưa lắp camera: phần giám sát dưới đây chỉ là minh hoạ, không làm theo để phun thuốc.</p>

      <dl className={`${kit.pn} ${styles.status}`}>
        <div><dt>2 thửa · 4 camera · cập nhật 12:25</dt><dd className={styles.live}>Đang giám sát</dd></div>
        <div><dt>Phát hiện mới 7 ngày</dt><dd>3</dd></div>
        <div><dt>Đang chờ duyệt phun</dt><dd>1</dd></div>
        <div><dt>Đang trong thời gian cách ly</dt><dd>1</dd></div>
      </dl>

      <section className={`${kit.pn} ${styles.cameras}`} aria-label="Bằng chứng từ camera">
        <div className={styles.head}>
          <h2>Bằng chứng từ camera</h2>
          <div className={styles.pills} role="group" aria-label="Chọn camera">
            <button type="button" aria-pressed={camera === null} onClick={() => setCamera(null)}>Tất cả</button>
            {CAMERAS.map(c => <button key={c.id} type="button" aria-pressed={camera === c.id} onClick={() => setCamera(c.id)}>Camera 0{c.id}</button>)}
          </div>
        </div>
        <ul className={styles.frames}>
          {CAMERAS.filter(c => camera === null || c.id === camera).map(c => (
            <li key={c.id} className={c.alert ? styles.alert : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image} alt={`Ảnh minh hoạ camera 0${c.id}`} />
              <span className={styles.name}>Camera 0{c.id}</span>
              <span className={styles.caption}><span>{c.place}</span><span>{c.time}</span></span>
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.columns}>
        <section className={`${kit.pn} ${styles.findings}`} aria-label="Phát hiện của AI">
          <div className={styles.head}><h2>Phát hiện của AI</h2></div>
          <div className={styles.pills} role="group" aria-label="Lọc phát hiện">
            {FILTERS.map(f => <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>)}
          </div>
          {list.length === 0 && <p className={styles.empty}>Không có phát hiện nào.</p>}
          <ul>
            {list.map(d => (
              <li key={d.id}>
                <button type="button" aria-pressed={d.id === selected?.id} onClick={() => setSelectedId(d.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.image} alt="" />
                  <span className={styles.grow}>
                    <strong>{d.name}</strong>
                    <small>{d.place} · {d.time}</small>
                    <small>{d.level} · độ tin cậy {d.confidence}%</small>
                  </span>
                  <span className={`${kit.tag} ${kit[d.statusTone]} ${styles.state}`}>{d.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selected && (
          <section className={`${kit.pn} ${styles.detail}`} aria-label="Chi tiết phát hiện">
            <div className={styles.head}>
              <h2>{selected.name}</h2>
              <span className={`${kit.tag} ${kit[selected.levelTone]}`}>Mức độ {selected.level}</span>
              <small>Mã phát hiện {selected.id}</small>
            </div>
            <div className={styles.body}>
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.photo} alt={`Ảnh minh hoạ ${selected.name}`} />
                <figcaption>Camera 0{selected.camera} · {selected.time}</figcaption>
              </figure>
              <div>
                <dl className={styles.rows}>
                  <div><dt>Vị trí</dt><dd>{selected.place}</dd></div>
                  <div><dt>Diện tích ảnh hưởng ước tính</dt><dd>{selected.area}</dd></div>
                  <div><dt>Triệu chứng</dt><dd>{selected.symptom}</dd></div>
                  <div><dt>Nguồn</dt><dd>Camera 0{selected.camera}, AI giám sát</dd></div>
                </dl>
                {selected.advice.length > 0 && (
                  <div className={styles.advice}>
                    <h3><Sparkles size={14} aria-hidden="true" />AI đề xuất, cán bộ đã điều chỉnh (ví dụ)</h3>
                    <dl className={styles.rows}>{selected.advice.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                  </div>
                )}
              </div>
              <div className={styles.timeline}>
                <h3>Tiến trình phê duyệt</h3>
                <ol>
                  {selected.steps.map(step => (
                    <li key={step.title} className={styles[step.state]}>
                      <i aria-hidden="true">{step.state === 'done' && <Check size={10} strokeWidth={3} />}</i>
                      <b>{step.title}</b>
                      <span>{step.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className={styles.actions}>
              <button type="button" className={kit.btn2} disabled title="Chưa hỗ trợ"><Flag size={14} aria-hidden="true" />Báo AI nhận sai</button>
              <span className={styles.grow} />
              <button type="button" className={kit.btn2} disabled title="Chưa có số điện thoại cán bộ"><Phone size={14} aria-hidden="true" />Gọi cán bộ</button>
              <Link href="/farmer/journal" className={kit.btn}>Xem nhật ký phun</Link>
            </div>
          </section>
        )}
      </div>
    </>
  )
}
