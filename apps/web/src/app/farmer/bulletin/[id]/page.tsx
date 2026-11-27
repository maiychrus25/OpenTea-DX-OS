// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import { SampleTag } from '@/components/features/sample/SampleTag'
import { CountRead } from '../_components/CountRead'
import { IMAGES, NEWS, label, minutes } from '../_components/news-data'
import styles from '../_components/newsroom.module.css'

export const metadata = { title: 'Bản tin' }

/** One example article. There is no news feed yet, so only its summary exists. */
export default function FarmerArticlePage({ params }: { params: { id: string } }) {
  const article = NEWS.find(item => item.id === params.id)
  if (!article) notFound()

  return (
    <div className={`${kit.page} ${styles.page}`}>
      <Link href="/farmer/bulletin" className={styles.back}><ArrowLeft size={16} aria-hidden="true" />Về bản tin</Link>
      <article className={`${kit.pn} ${styles.article}`}>
        {IMAGES[article.id] && (
          // the small pest crop is shown near its real size, so it stays sharp
          // eslint-disable-next-line @next/next/no-img-element
          <img className={IMAGES[article.id].startsWith('/images/handbook/') ? styles.smallPhoto : undefined} src={IMAGES[article.id]} alt="" />
        )}
        <p className={styles.kicker}><i className={styles[article.category]} aria-hidden="true" />{label(article.category)} <SampleTag /></p>
        <h1>{article.headline}</h1>
        <p className={styles.meta}>{article.date} · {article.sourceCount} nguồn · đọc {minutes(article.summary)} phút</p>
        <p>{article.summary}</p>
        <p className={styles.note}>Đây là bài mẫu: hệ thống chưa có nguồn tin nên chưa có nội dung đầy đủ.</p>
      </article>
      <CountRead id={article.id} />
    </div>
  )
}
