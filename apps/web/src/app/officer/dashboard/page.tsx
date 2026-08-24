// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { MetricCard, Pill, Button } from '@/components/ui'
import { MOCK_OFFICER_METRICS, MOCK_TASK_SCHEDULE } from '@/components/features/officer-dashboard/mock-data'
import styles from './officer-dashboard.module.css'

export const dynamic = 'force-dynamic'


export default async function OfficerDashboard() {
  const session = await auth()
  if (!session || session.user?.role !== 'officer') {
    redirect('/login')
  }

  return (
    <main className={styles.container}>
      <header className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <Pill tone="amber" className={styles.eyebrow}>
            5 việc cần ưu tiên
          </Pill>
          <h1 className={styles.pageTitle}>Công việc kỹ thuật hôm nay</h1>
          <p className={styles.subtitle}>Thứ Năm, 13 tháng 8 - Khu vực Tân Phú</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="primary" className={styles.addBtn}>
            + Tạo nhật ký
          </Button>
        </div>
      </header>

      <section className={styles.metricGrid} data-testid="officer-metric-grid">
        {MOCK_OFFICER_METRICS.map(metric => (
          <MetricCard
            key={metric.id}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
            icon={metric.icon}
            tone={metric.tone}
          />
        ))}
      </section>

      <section className={styles.scheduleSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Lịch công việc / Ưu tiên theo thời gian</h2>
          <Button variant="secondary" size="sm">+ Thêm việc</Button>
        </div>
        <table className={styles.taskTable} data-testid="task-table">
          <thead>
            <tr className={styles.tableHead}>
              <th>Thời gian</th>
              <th>Công việc</th>
              <th>Đối tượng</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_TASK_SCHEDULE.map(task => (
              <tr key={task.id} className={styles.tableRow}>
                <td>{task.time}</td>
                <td>{task.task}</td>
                <td>{task.target}</td>
                <td>
                  <Pill tone={task.tone}>{task.status}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
