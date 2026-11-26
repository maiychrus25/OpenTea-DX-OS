// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Map, Users, CalendarDays } from 'lucide-react'
import { Header, Stats } from '@/components/features/officer-web/parts'
import { TOURS, money, sum } from '@/components/features/officer-web/sample'
import styles from '@/components/features/officer-web/kit.module.css'

export const metadata = { title: 'Tour' }

/** Sample content: there is no tour service on this screen yet. */
export default function OfficerToursPage() {
  return (
    <div className={styles.page}>
      <Header icon={<Map size={24} />} title="Tour của HTX" description="Các tour đã có khách đặt. Tour đủ điều kiện mới được đăng và mở đặt, nên không có bước duyệt." />
      <Stats items={[
        { label: 'Đoàn sắp khởi hành', value: TOURS.length, icon: <Map /> },
        { label: 'Khách đã đặt', value: sum(TOURS, (t) => t.booked), icon: <Users /> },
        { label: 'Gần nhất', value: TOURS[0].date, icon: <CalendarDays /> },
      ]} />
      <div className={styles.tableBox}>
        <table className={styles.table}>
          <thead>
            <tr><th scope="col">Mã</th><th scope="col">Tour</th><th scope="col">Khởi hành</th><th scope="col">Đã đặt</th><th scope="col" className={styles.num}>Người lớn</th><th scope="col" className={styles.num}>Trẻ em</th></tr>
          </thead>
          <tbody>
            {TOURS.map((t) => (
              <tr key={t.code}>
                <td className={styles.mono}>{t.code}</td>
                <td><strong>{t.name}</strong></td>
                <td>{t.date}</td>
                <td>
                  <span className={styles.fill}>
                    <progress value={t.booked} max={t.seats} aria-label={`Đã đặt ${t.booked} trên ${t.seats} chỗ`} />
                    {t.booked}/{t.seats}
                  </span>
                </td>
                <td className={styles.num}>{money(t.adult)}</td>
                <td className={styles.num}>{money(t.child)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
