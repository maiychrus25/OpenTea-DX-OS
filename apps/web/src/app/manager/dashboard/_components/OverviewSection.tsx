// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import Link from 'next/link'
import { BarChart3, CalendarPlus, CheckSquare, ChevronRight, ClipboardList, FileText, Leaf, Package, Receipt, Scale, Zap } from 'lucide-react'
import type { WeekKg } from '@/lib/manager/overview'
import styles from './overview.module.css'

export interface Todo { key: string; title: string; detail: string; href: string }

const TODO_ICONS: Record<string, React.ReactNode> = {
  journals: <CheckSquare size={18} />,
  harvest: <Leaf size={18} />,
  unscheduled: <CalendarPlus size={18} />,
  settlements: <FileText size={18} />,
}

const ACTIONS = [
  { label: 'Lịch thu hái', href: '/manager/schedule', icon: <CalendarPlus size={22} /> },
  { label: 'Phiếu cân', href: '/manager/leaf-tickets', icon: <Scale size={22} /> },
  { label: 'Vật tư', href: '/manager/inputs', icon: <Package size={22} /> },
  { label: 'Quyết toán', href: '/manager/settlements', icon: <Receipt size={22} /> },
]

const kg = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })

/** Leaf bought week by week, what is waiting for the head, and the four places they go most. */
export function OverviewSection({ weeks, todos }: { weeks: WeekKg[]; todos: Todo[] }) {
  const max = Math.max(...weeks.map((w) => w.kg), 0)
  return (
    <div className={styles.row}>
      <section className={styles.card} aria-labelledby="weekly-leaf">
        <h2 id="weekly-leaf"><BarChart3 size={18} aria-hidden="true" />Búp thu mua theo tuần (kg)</h2>
        {max === 0 ? (
          <p className={styles.empty}>Chưa có phiếu cân trong 8 tuần qua.</p>
        ) : (
          <ol className={styles.chart}>
            {weeks.map((week, index) => (
              <li key={week.label} title={`Tuần từ ${week.label}: ${kg(week.kg)} kg`}>
                <span className={styles.value}>{week.kg > 0 ? kg(week.kg) : ' '}</span>
                <span className={styles.track}><i className={index === weeks.length - 1 ? styles.current : undefined} style={{ height: `${(week.kg / max) * 100}%` }} /></span>
                <span className={styles.week}>{week.label}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.card} aria-labelledby="todo-title">
        <h2 id="todo-title"><ClipboardList size={18} aria-hidden="true" />Công việc cần xử lý</h2>
        {todos.length === 0 ? (
          <p className={styles.empty}>Không có việc nào đang chờ.</p>
        ) : (
          <ul className={styles.todos}>
            {todos.map((todo) => (
              <li key={todo.key}>
                <Link href={todo.href}>
                  <span className={styles.todoIcon} aria-hidden="true">{TODO_ICONS[todo.key]}</span>
                  <span><strong>{todo.title}</strong><small>{todo.detail}</small></span>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className={styles.card} aria-labelledby="quick-title">
        <h2 id="quick-title"><Zap size={18} aria-hidden="true" />Thao tác nhanh</h2>
        <ul className={styles.actions}>
          {ACTIONS.map((action) => (
            <li key={action.href}><Link href={action.href}><span aria-hidden="true">{action.icon}</span>{action.label}</Link></li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
