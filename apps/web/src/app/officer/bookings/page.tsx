// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { CalendarCheck } from 'lucide-react'
import { FilteredTable } from '@/components/features/officer-web/FilteredTable'
import { Header, Stats } from '@/components/features/officer-web/parts'
import { BOOKINGS, money, sum } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Lượt đặt tour' }

/** Sample content: there is no booking service on this screen yet. */
export default function OfficerBookingsPage() {
  const active = BOOKINGS.filter((b) => b.status === 'Đã đặt')

  return (
    <div className={styles.page}>
      <Header icon={<CalendarCheck size={24} />} title="Lượt đặt tour" description="Khách đặt khi tour đã được đăng, không cần HTX duyệt." />
      <Stats items={[
        { label: 'Đoàn sắp đi', value: active.length },
        { label: 'Giá trị đặt (không tính đã huỷ)', value: money(sum(active, (b) => b.total)) },
      ]} />
      <FilteredTable
        filters={['Đã đặt', 'Đã huỷ']}
        columns={['Mã', 'Khách', 'Tour', 'Ngày đi', 'Số khách', 'Giá trị', 'Trạng thái']}
        numeric={[4, 5]}
        rows={BOOKINGS.map((b) => ({
          key: b.code,
          group: b.status,
          cells: [
            <span key="code" className={styles.mono}>{b.code}</span>,
            b.guest,
            b.tour,
            b.date,
            b.people,
            money(b.total),
            <span key="status" className={`${styles.tag} ${b.status === 'Đã đặt' ? styles.ok : styles.mu}`}>{b.status}</span>,
          ],
        }))}
      />
    </div>
  )
}
