// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { redirect } from 'next/navigation'
import { Camera, KeyRound, Lock, Pencil, Smartphone } from 'lucide-react'
import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { TelegramLinkCard } from '@/components/features/telegram/TelegramLinkCard'
import { SignOutButton } from '@/components/features/farmer-web/SignOutButton'
import kit from '@/components/features/farmer-web/kit.module.css'
import { BRAND_NAME } from '@/lib/brand'
import { version } from '../../../../package.json'
import styles from './page.module.css'

const initials = (name: string) => {
  const words = name.split(/\s+/).filter(Boolean)
  return `${words[0]?.[0] ?? ''}${words.length > 1 ? words[words.length - 1][0] : ''}`.toUpperCase()
}

const STAGE: Record<string, { label: string; tone: string }> = {
  SOWING: { label: 'Xuống giống', tone: 'in' },
  TENDING: { label: 'Đang chăm sóc', tone: 'soft' },
  HARVEST_APPROVED: { label: 'Được phép thu hoạch', tone: 'amber' },
  HARVESTED: { label: 'Đã thu hoạch', tone: 'mu' },
}

const NOT_YET = 'Chưa hỗ trợ'

export default async function FarmerProfilePage() {
  const session = await auth()
  if (!session) redirect('/login')

  const { htxCode } = session.user
  const [household, htx] = await Promise.all([
    prisma.household.findFirst({ where: { keycloak_user_id: session.user.id }, include: { parcels: true } }),
    htxCode ? prisma.htxProfile.findUnique({ where: { htx_code: htxCode }, select: { name: true } }) : null,
  ])
  const name = session.user.name || 'Nông dân'
  const parcels = [...(household?.parcels ?? [])].sort((a, b) => String(a.parcel_code).localeCompare(String(b.parcel_code)))
  const hectares = parcels.reduce((sum, p) => sum + p.area_ha, 0)
  const tonnes = parcels.reduce((sum, p) => sum + p.area_ha * (p.estimated_yield_per_ha ?? 0), 0) / 1000
  const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
  const joined = household?.created_at
    ? new Date(household.created_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'
  const field = (label: string, value: string, locked = false) => (
    <label className={styles.field}>
      {label}
      <span>
        <input value={value} readOnly />
        {locked && <Lock size={13} aria-hidden="true" />}
      </span>
    </label>
  )

  return (
    <div className={`${kit.page} ${styles.page}`}>
      <div className={styles.head}>
        <h1>Tài khoản</h1>
        <p>Thông tin cá nhân, thửa chè và bảo mật tài khoản</p>
      </div>

      <section className={`${kit.pn} ${styles.identity}`} aria-label="Tài khoản cá nhân">
        <span className={styles.face} aria-hidden="true">
          {initials(name)}
          <i title="Chưa hỗ trợ đổi ảnh"><Camera size={13} /></i>
        </span>
        <span className={styles.who}>
          <strong>{name}</strong>
          <span className={styles.meta}><span>Nông dân</span>{htx?.name ? ` · ${htx.name}` : ''}</span>
          {household && <span className={`${kit.tag} ${kit.soft}`}>Đã liên kết hộ</span>}
        </span>
        <dl className={styles.stats}>
          <div><dd>{parcels.length}</dd><dt>Thửa chè</dt></div>
          <div><dd>{number(hectares)} ha</dd><dt>Diện tích</dt></div>
          <div><dd>{number(tonnes)} tấn</dd><dt>Sản lượng dự kiến</dt></div>
        </dl>
      </section>

      <section className={kit.pn} aria-label="Thông tin cá nhân">
        <div className={styles.title}>
          <h2>Thông tin cá nhân</h2>
          <button type="button" className={styles.edit} disabled title="Chưa hỗ trợ sửa thông tin"><Pencil size={14} aria-hidden="true" />Chỉnh sửa</button>
        </div>
        <div className={styles.fields}>
          {field('Họ và tên', household?.name ?? name)}
          {field('Số điện thoại', household?.phone ?? '—')}
          {field('Địa chỉ', household?.address ?? '—')}
          {field('Hợp tác xã', htx?.name ?? '—', true)}
          {field('Mã hộ', 'Chưa cấp', true)}
          {field('Ngày tham gia', joined, true)}
        </div>
        <div className={styles.actions}>
          <p className={styles.note}>Chưa hỗ trợ tự sửa thông tin. Cần thay đổi, vui lòng liên hệ cán bộ HTX.</p>
          <button type="button" className={kit.btn2} disabled>Huỷ</button>
          <button type="button" className={kit.btn} disabled title="Chưa hỗ trợ sửa thông tin">Lưu thay đổi</button>
        </div>
      </section>

      <section className={kit.pn} aria-label="Thửa chè của tôi">
        <div className={styles.title}>
          <h2>Thửa chè của tôi <small>{parcels.length} thửa · {number(hectares)} ha</small></h2>
        </div>
        {parcels.length === 0 ? (
          <p className={styles.note}>Bạn chưa có thửa đất nào được phân công.</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead><tr><th>Mã thửa</th><th>Giống</th><th>Diện tích</th><th>Giai đoạn</th></tr></thead>
              <tbody>
                {parcels.map(parcel => {
                  const stage = STAGE[parcel.status] ?? { label: 'Bản nháp', tone: 'mu' }
                  return (
                    <tr key={parcel.id}>
                      <td><b>{parcel.parcel_code}</b></td>
                      <td>{parcel.crop_type}</td>
                      <td>{number(parcel.area_ha)} ha</td>
                      <td><span className={`${kit.tag} ${kit[stage.tone]}`}>{stage.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.note}>Muốn thêm hoặc sửa thửa, vui lòng liên hệ cán bộ HTX.</p>
      </section>

      <section className={kit.pn} aria-label="Bảo mật">
        <div className={styles.title}><h2 className={styles.barred}>Bảo mật</h2></div>
        <ul className={styles.options}>
          {[
            { icon: KeyRound, label: 'Mã PIN đăng nhập', action: 'Đổi' },
            { icon: Smartphone, label: 'Thiết bị đăng nhập', action: 'Quản lý' },
          ].map(({ icon: Icon, label, action }) => (
            <li key={label}>
              <span className={styles.icon}><Icon size={17} strokeWidth={1.6} aria-hidden="true" /></span>
              <span className={kit.grow}>{label}<small>{NOT_YET}</small></span>
              <button type="button" className={kit.btn2} disabled>{action}</button>
            </li>
          ))}
        </ul>
      </section>

      <TelegramLinkCard role="farmer" />

      <section className={styles.foot} aria-label="Hỗ trợ và đăng xuất">
        <SignOutButton />
        <p>{BRAND_NAME} · phiên bản {version}</p>
      </section>
    </div>
  )
}
