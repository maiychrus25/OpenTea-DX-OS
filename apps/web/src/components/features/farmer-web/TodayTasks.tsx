// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import { SampleTag } from '@/components/features/sample/SampleTag'
import kit from './kit.module.css'

const TASKS = [
  'Kiểm tra độ ẩm và thoát nước cho các thửa chè',
  'Theo dõi tình trạng sâu bệnh (bọ xít muỗi, rầy xanh)',
  'Chuẩn bị phân bón NPK cho đợt bón tuần này',
]

/** Example checklist: the system has no task list yet, so ticks are kept only on this screen. */
export function TodayTasks({ className }: { className?: string }) {
  const [done, setDone] = useState<number[]>([])
  return (
    <section className={`${kit.pn} ${className ?? ''}`} aria-label="Việc cần làm hôm nay">
      <div className={kit.ph}><h2>Việc cần làm hôm nay</h2><SampleTag /></div>
      <ul className={kit.list} style={{ padding: '6px 0' }}>
        {TASKS.map((task, index) => (
          <li key={task}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 18px', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={done.includes(index)} onChange={() => setDone(list => list.includes(index) ? list.filter(i => i !== index) : [...list, index])} />
              {task}
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
