// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/* eslint-disable @next/next/no-img-element -- small photos shipped with the page */

import React from 'react'
import { Map, Users, CalendarDays } from 'lucide-react'
import { FilteredTable } from '@/components/features/officer-web/FilteredTable'
import { Header } from '@/components/features/officer-web/parts'
import { TOURS, money, sum } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Tour' }

/** Sample content: there is no tour service on this screen yet. */
export default function OfficerToursPage() {
  return (
    <div className={styles.page}>
      <Header icon={<Map size={24} />} title="Tour của HTX" description="Các tour đã có khách đặt. Tour đủ điều kiện mới được đăng và mở đặt, nên không có bước duyệt." />
      <FilteredTable
        figures={[
          { label: 'Đoàn sắp khởi hành', value: TOURS.length, icon: <Map /> },
          { label: 'Khách đã đặt', value: sum(TOURS, (t) => t.booked), icon: <Users />, sort: 'booked' },
          { label: 'Gần nhất', value: TOURS[0].date, icon: <CalendarDays />, filter: 'Gần nhất' },
        ]}
        filters={[]}
        columns={['Mã', 'Tour', 'Khởi hành', 'Đã đặt', 'Người lớn', 'Trẻ em']}
        numeric={[4, 5]}
        rows={TOURS.map((t) => ({
          key: t.code,
          group: t.date === TOURS[0].date ? 'Gần nhất' : '',
          rank: { booked: t.booked },
          cells: [
            <span key="code" className={styles.mono}>{t.code}</span>,
            <span key="name" className={styles.tourName}><img src={t.image} alt="" />{t.name}</span>,
            t.date,
            <span key="fill" className={styles.fill}>
              <progress value={t.booked} max={t.seats} aria-label={`Đã đặt ${t.booked} trên ${t.seats} chỗ`} />
              {t.booked}/{t.seats}
            </span>,
            money(t.adult),
            money(t.child),
          ],
        }))}
      />
    </div>
  )
}
