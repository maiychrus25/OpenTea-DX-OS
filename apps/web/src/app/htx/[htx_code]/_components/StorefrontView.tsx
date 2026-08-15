// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React from 'react'
import { MapPin, Users, Leaf, Box, Calendar, Phone, Mail } from 'lucide-react'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import styles from '../storefront.module.css'
import { Lot, HtxProfile } from '@prisma/client'

// Use a simplified type to avoid deep nested prisma types if they cause issues
type StorefrontData = HtxProfile & {
  lots: Lot[]
  _count: { households: number }
}

interface StorefrontViewProps {
  htx: StorefrontData
}

export function StorefrontView({ htx }: StorefrontViewProps) {
  const activeYears = new Date().getFullYear() - htx.created_at.getFullYear()

  return (
    <main className={styles.storeShell}>
      {/* Hero Section */}
      <section className={styles.storeHero}>
        <div className={styles.heroAvatar}>
          <Users size={32} />
        </div>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>{htx.name}</h1>
          <div className={styles.heroSubtitle}>
            <MapPin size={16} />
            <span>{htx.address}</span>
          </div>
          <Pill tone="green">Đang hoạt động</Pill>
        </div>
      </section>

      {/* Stats Row */}
      <section className={styles.statsRow}>
        <div className={styles.statCard}>
          <Users className={styles.contactIcon} size={24} />
          <span className={styles.statLabel}>Hộ nông dân</span>
          <span className={styles.statValue}>{htx._count.households}</span>
        </div>
        <div className={styles.statCard}>
          <Leaf className={styles.contactIcon} size={24} />
          <span className={styles.statLabel}>Diện tích (ha)</span>
          <span className={styles.statValue}>{htx.total_area_ha}</span>
        </div>
        <div className={styles.statCard}>
          <Box className={styles.contactIcon} size={24} />
          <span className={styles.statLabel}>Lô hàng sẵn sàng</span>
          <span className={styles.statValue}>{htx.lots.length}</span>
        </div>
        <div className={styles.statCard}>
          <Calendar className={styles.contactIcon} size={24} />
          <span className={styles.statLabel}>Năm hoạt động</span>
          <span className={styles.statValue}>{activeYears}</span>
        </div>
      </section>

      {/* Lot List */}
      <section>
        <h2 className={styles.sectionTitle}>Lô hàng sẵn sàng</h2>
        {htx.lots.length > 0 ? (
          <div className={styles.lotList}>
            {htx.lots.map((lot) => (
              <div key={lot.id} className={styles.lotCard}>
                <div className={styles.lotInfo}>
                  <div className={styles.lotName}>{lot.commodity}</div>
                  <div className={styles.lotDetail}>
                    Mã lô: {lot.lot_code} &bull; Số lượng: {lot.total_weight_kg ? `${lot.total_weight_kg} kg` : 'Chưa cập nhật'}
                  </div>
                </div>
                <div className={styles.lotActions}>
                  <Pill tone="blue">READY</Pill>
                  <Button variant="primary">Liên hệ</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            Hiện chưa có lô hàng nào ở trạng thái sẵn sàng giao dịch.
          </div>
        )}
      </section>

      {/* Contact Section */}
      <section className={styles.contactSection}>
        <h2 className={styles.sectionTitle}>Thông tin liên hệ</h2>
        <div className={styles.contactGrid}>
          {htx.contact_phone && (
            <div className={styles.contactItem}>
              <Phone className={styles.contactIcon} size={20} />
              <div className={styles.contactText}>
                <span className={styles.contactLabel}>Số điện thoại</span>
                <span className={styles.contactValue}>{htx.contact_phone}</span>
              </div>
            </div>
          )}
          {htx.contact_email && (
            <div className={styles.contactItem}>
              <Mail className={styles.contactIcon} size={20} />
              <div className={styles.contactText}>
                <span className={styles.contactLabel}>Email</span>
                <span className={styles.contactValue}>{htx.contact_email}</span>
              </div>
            </div>
          )}
          {!htx.contact_phone && !htx.contact_email && (
            <div className={styles.contactItem}>
              <span className={styles.contactValue}>HTX chưa cập nhật thông tin liên hệ.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
