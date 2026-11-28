// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import Link from 'next/link'
import { Calendar, ChevronRight, Coins, Leaf, Sparkles, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { LineChart } from '@/app/manager/reports/_components/charts'
import { Sample, StatCards } from '@/components/features/manager-web/parts'
import styles from './ai.module.css'

export interface AiData {
  /** Fresh leaf expected in the next 14 days; null when the forecast cannot be read. */
  forecastKg: number | null
  harvest: { from: string; to: string } | null
  price: number | null
  months: { label: string; kg: number }[]
  suggestions: { id: string; title: string; reason: string }[]
}

const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 0 })
const day = (value: string) => value.slice(0, 10).split('-').reverse().slice(0, 2).join('/')

/** What the data says ahead of the proposals that wait for the head. */
export function AiOverview({ data }: { data: AiData }) {
  return (
    <>
      <PageHeader icon={<Sparkles size={28} />} title="Đề xuất AI" description="Phân tích dữ liệu và đưa ra gợi ý cho sản xuất, thu hái và kinh doanh." />
      <StatCards items={[
        { label: 'Dự báo búp 14 ngày', value: data.forecastKg === null ? '—' : `${number(data.forecastKg)} kg`, icon: <Leaf size={26} /> },
        { label: 'Thời điểm thu hái', value: data.harvest ? `${day(data.harvest.from)} – ${day(data.harvest.to)}` : '—', icon: <Calendar size={26} /> },
        { label: 'Giá thu mua hôm nay', value: data.price === null ? '—' : `${number(data.price)} đ/kg`, icon: <Coins size={26} /> },
        { label: 'Hiệu quả sản xuất', value: '+12,6%', icon: <TrendingUp size={26} />, sample: true },
      ]} />
      <div className={styles.columns}>
        <section className={styles.card} aria-labelledby="leaf-months">
          <h2 id="leaf-months"><Sparkles size={18} aria-hidden="true" />Sản lượng búp thu mua theo tháng (kg)</h2>
          {data.months.some((m) => m.kg > 0) ? <LineChart points={data.months} /> : <p>Chưa có phiếu cân trong sáu tháng qua.</p>}
        </section>
        <section className={styles.card} aria-labelledby="highlights">
          <h2 id="highlights"><Sparkles size={18} aria-hidden="true" />Gợi ý nổi bật</h2>
          {data.suggestions.length === 0 ? <p>Không có đề xuất nào đang chờ. <Sample /> Khi có, đề xuất thật của trợ lý hiện ở đây.</p> : (
            <ul>
              {data.suggestions.map((s) => (
                <li key={s.id}><Link href="#proposals"><span><strong>{s.title}</strong><small>{s.reason}</small></span><ChevronRight size={15} aria-hidden="true" /></Link></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
