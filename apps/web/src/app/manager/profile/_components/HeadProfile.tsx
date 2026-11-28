// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Building2, CalendarDays, Download, Eye, FileText, Layers, Leaf, Mail, MapPin, Pencil, Phone, UserRound, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Sample, Tabs } from '@/components/features/manager-web/parts'
import kit from '@/components/features/dashboard/page-kit.module.css'
import type { HtxProfile } from '@/domain/profile/entities/HtxProfile'
import { ProfileForm } from './ProfileForm'
import styles from './head.module.css'

type Tab = 'general' | 'legal' | 'production' | 'certificates' | 'documents'

export interface ProfileOverview { households: number; parcels: number; area: number; certificates: number }

interface Props {
  profile: HtxProfile | null
  htxCode: string
  userName: string
  overview: ProfileOverview | null
}

const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })

/** The cooperative's card, then its information by tab. */
export function HeadProfile({ profile, htxCode, userName, overview }: Props) {
  const [tab, setTab] = useState<Tab>('general')
  const [edits, setEdits] = useState(0)
  const name = profile?.name ?? 'Chưa có hồ sơ'

  return (
    <>
      <PageHeader
        icon={<FileText size={28} />}
        title="Hồ sơ HTX"
        description="Thông tin chung, pháp lý và liên hệ của Hợp tác xã."
        actions={
          <>
            <Link href={`/htx/${encodeURIComponent(htxCode)}`} className={kit.secondary}><Eye size={16} aria-hidden="true" /> Xem gian hàng công khai</Link>
            <button type="button" className={kit.primary} onClick={() => { setTab('general'); setEdits(edits + 1) }}><Pencil size={16} aria-hidden="true" />Chỉnh sửa</button>
          </>
        }
      />

      <section className={styles.hero}>
        <h2 className="sr-only">Tổng quan HTX</h2>
        <span className={styles.photo} aria-hidden="true" />
        <div className={styles.identity}>
          <p className={styles.name}><strong>{name}</strong><span>Đang hoạt động</span></p>
          <p><Building2 size={15} aria-hidden="true" />Mã HTX: <b>{htxCode}</b></p>
          <p><UserRound size={15} aria-hidden="true" />Loại hình: <b>Hợp tác xã nông nghiệp</b> <Sample /></p>
          <p><CalendarDays size={15} aria-hidden="true" />Ngày thành lập: <b>10/03/2019</b> <Sample /></p>
          <p><MapPin size={15} aria-hidden="true" />Địa chỉ: <b>{profile?.address || '—'}</b></p>
        </div>
        <dl className={styles.figures}>
          <div><Users size={26} aria-hidden="true" /><dd>{overview ? number(overview.households) : '—'}</dd><dt>Hộ thành viên</dt></div>
          <div><Leaf size={26} aria-hidden="true" /><dd>{overview ? `${number(overview.area)} ha` : '—'}</dd><dt>Diện tích vùng trồng</dt></div>
          <div><Layers size={26} aria-hidden="true" /><dd>120 tấn/năm</dd><dt>Sản lượng dự kiến <Sample /></dt></div>
        </dl>
      </section>

      <Tabs<Tab>
        label="Mục hồ sơ"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'general', label: 'Thông tin chung' },
          { key: 'legal', label: 'Pháp lý' },
          { key: 'production', label: 'Sản xuất & vùng trồng' },
          { key: 'certificates', label: 'Chứng nhận' },
          { key: 'documents', label: 'Tài liệu' },
        ]}
      />

      <div className={styles.columns}>
        {tab === 'general' ? (
          <section aria-label="Hồ sơ HTX">
            <ProfileForm key={edits} initialData={profile} startEditing={edits > 0} />
          </section>
        ) : (
          <section className={styles.card}>
            {tab === 'legal' && <><h2>Pháp lý <Sample /></h2><dl className={styles.rows}><div><dt>Mã số thuế</dt><dd>4601234567</dd></div><div><dt>Người đại diện pháp luật</dt><dd>{userName}</dd></div></dl></>}
            {tab === 'production' && <><h2>Sản xuất & vùng trồng</h2><dl className={styles.rows}><div><dt>Giống chè</dt><dd>{profile?.crop_types?.join(', ') || '—'}</dd></div><div><dt>Số thửa</dt><dd>{overview ? number(overview.parcels) : '—'}</dd></div><div><dt>Diện tích thửa</dt><dd>{overview ? `${number(overview.area)} ha` : '—'}</dd></div><div><dt>Lứa hiện tại</dt><dd>{profile?.season_label || '—'}</dd></div></dl><Link href="/manager/farm-zones">Mở Vùng trồng</Link></>}
            {tab === 'certificates' && <><h2>Chứng nhận</h2><p>{overview ? overview.certificates : 0} chứng nhận đã lưu.</p><Link href="/manager/certificates">Mở trang Chứng nhận</Link></>}
            {tab === 'documents' && <><h2>Tài liệu <Sample /></h2><p>Chưa có kho tài liệu riêng cho hồ sơ HTX.</p></>}
          </section>
        )}

        <div className={styles.side}>
          <section className={styles.card}>
            <h2>Logo & nhận diện <Sample /></h2>
            <div className={styles.logoRow}>
              <span className={styles.logo} aria-hidden="true"><Leaf size={36} /></span>
              <div>
                <strong>Logo HTX</strong>
                <small>Định dạng JPG, PNG · tối đa 2 MB</small>
                <button type="button" className={kit.secondary} disabled title="Chưa hỗ trợ tải logo"><Download size={14} aria-hidden="true" />Thay đổi logo</button>
              </div>
            </div>
          </section>
          <section className={styles.card}>
            <h2>Thông tin liên hệ</h2>
            <dl className={styles.rows}>
              <div><dt><UserRound size={14} aria-hidden="true" /> Người đại diện</dt><dd>{userName} – Trưởng HTX</dd></div>
              <div><dt><Phone size={14} aria-hidden="true" /> Điện thoại</dt><dd>{profile?.contact_phone || '—'}</dd></div>
              <div><dt><Mail size={14} aria-hidden="true" /> Email</dt><dd>{profile?.contact_email || '—'}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </>
  )
}
