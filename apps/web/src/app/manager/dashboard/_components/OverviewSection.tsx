// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import Link from 'next/link'
import { AlertCircle, AlertTriangle, ArrowRight, BarChart3, CalendarCheck, CalendarDays, CalendarPlus, CheckSquare, ChevronRight, ClipboardList, FileText, Newspaper, Package, Scale, Zap } from 'lucide-react'
import { Sample } from '@/components/features/manager-web/parts'
import type { WeekKg } from '@/lib/manager/overview'
import styles from './overview.module.css'

export interface Todo { key: 'journals' | 'harvest' | 'tickets' | 'settlements'; title: string; detail: string; href: string; sample?: boolean }
export interface Warning { key: string; title: string; detail: string; href: string; tone: 'amber' | 'red'; sample?: boolean }
export interface News { title: string; detail: string; date: string; sample?: boolean }

const TODO_ICONS = {
  journals: <CheckSquare size={20} />,
  harvest: <CalendarCheck size={20} />,
  tickets: <Scale size={20} />,
  settlements: <FileText size={20} />,
}

const ACTIONS = [
  { label: 'Tạo lịch thu hái', href: '/manager/schedule', icon: <CalendarPlus size={24} /> },
  { label: 'Lập phiếu cân', href: '/manager/leaf-tickets', icon: <Scale size={24} /> },
  { label: 'Nhập vật tư', href: '/manager/inputs', icon: <Package size={24} /> },
  { label: 'Lập quyết toán', href: '/manager/settlements', icon: <FileText size={24} /> },
]

const kg = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })

/** A round figure at or above the largest week, so the axis reads in clean steps. */
function ceiling(max: number): number {
  const step = 10 ** Math.floor(Math.log10(Math.max(max, 6) / 6))
  const size = [1, 2, 5, 10].map((m) => m * step).find((s) => s * 6 >= max) ?? step * 10
  return size * 6
}

function WeekChart({ weeks }: { weeks: WeekKg[] }) {
  const top = ceiling(Math.max(...weeks.map((w) => w.kg), 0))
  const last = weeks.length - 1
  return (
    <div className={styles.chartBox}>
      <ul className={styles.axis} aria-hidden="true">
        {[6, 5, 4, 3, 2, 1, 0].map((n) => <li key={n}>{kg((top / 6) * n)}</li>)}
      </ul>
      <ol className={styles.chart}>
        {weeks.map((week, index) => (
          <li key={week.label} title={`Tuần từ ${week.label}: ${kg(week.kg)} kg`}>
            <span className={styles.track}>
              <i style={{ height: `${(week.kg / top) * 100}%`, opacity: 0.35 + (0.65 * index) / Math.max(1, last) }}>
                {index === last && week.kg > 0 && <b>{kg(week.kg)} kg</b>}
              </i>
            </span>
            <span className={styles.week}>T{index + 1}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function OverviewSection({ weeks, todos, warnings, news }: { weeks: WeekKg[]; todos: Todo[]; warnings: Warning[]; news: News }) {
  return (
    <>
      <div className={styles.row}>
        <section className={styles.card} aria-labelledby="weekly-leaf">
          <h2 id="weekly-leaf"><BarChart3 size={20} aria-hidden="true" />Sản lượng thu hái theo tuần</h2>
          <span className={styles.unit}>kg</span>
          <WeekChart weeks={weeks} />
        </section>

        <section className={styles.card} aria-labelledby="todo-title">
          <h2 id="todo-title"><ClipboardList size={20} aria-hidden="true" />Công việc cần xử lý</h2>
          <ul className={styles.todos}>
            {todos.map((todo) => (
              <li key={todo.key}>
                <Link href={todo.href}>
                  <span className={styles.todoIcon} aria-hidden="true">{TODO_ICONS[todo.key]}</span>
                  <span><strong>{todo.title} {todo.sample && <Sample />}</strong><small>{todo.detail}</small></span>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <nav className={styles.card} aria-labelledby="quick-title">
          <h2 id="quick-title"><Zap size={20} aria-hidden="true" />Thao tác nhanh</h2>
          <ul className={styles.actions}>
            {ACTIONS.map((action) => (
              <li key={action.href}><Link href={action.href}><span aria-hidden="true">{action.icon}</span>{action.label}</Link></li>
            ))}
          </ul>
        </nav>
      </div>

      <div className={styles.bottom}>
        <section className={styles.card} aria-labelledby="warning-title">
          <h2 id="warning-title"><AlertTriangle size={20} aria-hidden="true" />Cảnh báo & nhắc việc</h2>
          <ul className={styles.warnings}>
            {warnings.map((warning) => (
              <li key={warning.key} data-tone={warning.tone}>
                <Link href={warning.href}>
                  {warning.tone === 'red' ? <AlertCircle size={20} aria-hidden="true" /> : <AlertTriangle size={20} aria-hidden="true" />}
                  <span><strong>{warning.title} {warning.sample && <Sample />}</strong><small>{warning.detail}</small></span>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card} aria-labelledby="news-title">
          <div className={styles.cardHead}>
            <h2 id="news-title"><Newspaper size={20} aria-hidden="true" />Bản tin HTX</h2>
            <Link href="/manager/notifications">Xem tất cả <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <article className={styles.news}>
            <span className={styles.thumb} aria-hidden="true" />
            <div>
              <strong>{news.title} {news.sample && <Sample />}</strong>
              <p>{news.detail}</p>
              <small><CalendarDays size={13} aria-hidden="true" />Ngày {news.date}</small>
            </div>
          </article>
        </section>
      </div>
    </>
  )
}
