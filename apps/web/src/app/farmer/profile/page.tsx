// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { redirect } from 'next/navigation'
import { CalendarDays, CloudRain, Lock, Phone, ShieldCheck, UserRound, Volume2 } from 'lucide-react'
import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { TelegramLinkCard } from '@/components/features/telegram/TelegramLinkCard'
import { SignOutButton } from '@/components/features/farmer-web/SignOutButton'
import kit from '@/components/features/farmer-web/kit.module.css'
import styles from './page.module.css'

const initials = (name: string) => {
  const words = name.split(/\s+/).filter(Boolean)
  return `${words[0]?.[0] ?? ''}${words.length > 1 ? words[words.length - 1][0] : ''}`.toUpperCase()
}

export default async function FarmerProfilePage() {
  const session = await auth()
  if (!session) redirect('/login')

  const { htxCode } = session.user
  const [household, htx] = await Promise.all([
    prisma.household.findFirst({ where: { keycloak_user_id: session.user.id }, include: { parcels: true } }),
    htxCode ? prisma.htxProfile.findUnique({ where: { htx_code: htxCode }, select: { name: true } }) : null,
  ])
  const name = session.user.name || 'Nông dân'
  const parcels = household?.parcels ?? []
  const hectares = parcels.reduce((sum, p) => sum + p.area_ha, 0)
  const tonnes = parcels.reduce((sum, p) => sum + p.area_ha * (p.estimated_yield_per_ha ?? 0), 0) / 1000
  const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
  const field = (label: string, value: string) => (
    <label className={kit.fl}>{label}<input className={kit.inp} value={value} readOnly /></label>
  )

  return (
    <div className={kit.page}>
      <div className={kit.hd}>
        <span className={kit.hico}><UserRound size={28} aria-hidden="true" /></span>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Tài khoản</h1>
          <p className={kit.sub}>Thông tin cá nhân, mã PIN và cài đặt thông báo</p>
        </div>
        <button type="button" className={kit.btn} disabled title="Chưa hỗ trợ sửa thông tin">Lưu thay đổi</button>
      </div>

      <div className={kit.cols}>
        <div className={`${kit.stack} ${styles.wide}`}>
          <section className={`${kit.pn} ${styles.identity}`} aria-label="Tài khoản cá nhân">
            <span className={styles.face} aria-hidden="true">{initials(name)}</span>
            <span className={kit.grow}>
              <strong className={styles.name}>{name}</strong>
              <span className={styles.meta}><span>Nông dân</span>{htx?.name ? ` · ${htx.name}` : ''}</span>
            </span>
            <dl className={styles.stats}>
              <div><dd>{parcels.length}</dd><dt>Thửa</dt></div>
              <div><dd>{number(hectares)} ha</dd><dt>Diện tích</dt></div>
              <div><dd>{number(tonnes)} t</dd><dt>Dự kiến</dt></div>
            </dl>
          </section>

          <section className={kit.pn} aria-label="Thông tin cá nhân">
            <div className={kit.ph}><h2>Thông tin cá nhân</h2></div>
            <div className={`${styles.fields} ${kit.two}`}>
              {field('Họ và tên', household?.name ?? name)}
              {field('Số điện thoại', household?.phone ?? '—')}
              {field('Địa chỉ', household?.address ?? '—')}
              {field('HTX', htx?.name ?? '—')}
            </div>
          </section>

          <TelegramLinkCard role="farmer" />
        </div>

        <div className={`${kit.stack} ${styles.narrow}`}>
          <section className={kit.pn} aria-label="Bảo mật">
            <div className={kit.ph}><h2>Bảo mật</h2></div>
            <ul className={kit.list}>
              <li className={styles.option}><Lock size={18} aria-hidden="true" /><span className={kit.grow}>Đổi mã PIN<small>Chưa hỗ trợ</small></span><button type="button" className={kit.btn2} disabled>Đổi</button></li>
              <li className={styles.option}><ShieldCheck size={18} aria-hidden="true" /><span className={kit.grow}>Khóa thiết bị<small>Chưa hỗ trợ</small></span><button type="button" className={kit.btn2} disabled>Quản lý</button></li>
            </ul>
          </section>

          <section className={kit.pn} aria-label="Thông báo">
            <div className={kit.ph}><h2>Thông báo</h2></div>
            <ul className={kit.list}>
              {[{ icon: Volume2, label: 'Đọc to bản tin' }, { icon: CloudRain, label: 'Cảnh báo thời tiết' }, { icon: CalendarDays, label: 'Nhắc lịch thu hái' }].map(({ icon: Icon, label }) => (
                <li key={label} className={styles.option}>
                  <label className={styles.toggle}><Icon size={18} aria-hidden="true" /><span className={kit.grow}>{label}<small>Chưa hỗ trợ tắt bật</small></span><input type="checkbox" checked disabled readOnly /></label>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${kit.pn} ${styles.actions}`} aria-label="Hỗ trợ và đăng xuất">
            <button type="button" className={kit.btn2} disabled title="Chưa có số điện thoại cán bộ"><Phone size={16} aria-hidden="true" />Gọi cán bộ kỹ thuật</button>
            <SignOutButton />
          </section>
        </div>
      </div>
    </div>
  )
}
