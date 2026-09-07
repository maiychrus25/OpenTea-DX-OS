// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { notFound } from 'next/navigation'
import { prisma } from '@/infrastructure/db/prisma.client'
import { Pill } from '@/components/ui'
import styles from './qr.module.css'

interface PageProps {
  params: Promise<{ lot_code: string }>
}

const ACTIVITY_VN: Record<string, string> = {
  SOWING: 'Gieo sạ',
  FERTILIZING: 'Bón phân',
  SPRAYING: 'Phun thuốc',
  IRRIGATION: 'Tưới tiêu',
  HARVEST: 'Thu hoạch',
  OTHER: 'Khác',
}

export default async function QrTracePage({ params }: PageProps) {
  const { lot_code } = await params
  const decodedCode = decodeURIComponent(lot_code)

  // Query lot from database
  const lot = await prisma.lot.findUnique({
    where: { lot_code: decodedCode },
    include: {
      htx_profile: { select: { name: true, address: true, contact_phone: true } },
      lot_parcels: {
        include: {
          parcel: {
            include: {
              household: { select: { owner_name: true, phone: true, address: true } },
              journal_entries: {
                orderBy: { entry_date: 'asc' },
                where: { status: 'APPROVED' },
                take: 20,
                include: {
                  activities: { select: { activity_detail: true, product_name: true, dosage: true, withdrawal_days: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!lot) {
    notFound()
  }

  // Gather data from parcels
  const parcels = lot.lot_parcels.map((lp) => lp.parcel)
  const firstParcel = parcels[0]
  const household = firstParcel?.household
  const journalEntries = parcels.flatMap((p) => p.journal_entries).sort(
    (a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()
  )

  // Withdrawal calculation
  const sprayEntries = journalEntries.filter((e) => e.activity_type === 'SPRAYING')
  const lastSpray = sprayEntries.length > 0 ? sprayEntries[sprayEntries.length - 1] : null
  let withdrawalStatus = 'NO_PESTICIDE'
  let withdrawalDays = 0
  let requiredDays = 0
  let daysElapsed = 0

  if (lastSpray) {
    const lastActivity = lastSpray.activities[0]
    requiredDays = lastActivity?.withdrawal_days || 14
    daysElapsed = Math.floor(
      (new Date(lot.harvest_date).getTime() - new Date(lastSpray.entry_date).getTime()) /
      (1000 * 60 * 60 * 24)
    )
    withdrawalDays = daysElapsed
    withdrawalStatus = daysElapsed >= requiredDays ? 'PASSED' : 'FAILED'
  }

  const statusTone = withdrawalStatus === 'PASSED' || withdrawalStatus === 'NO_PESTICIDE' ? 'green' : 'neutral'
  const statusLabel =
    withdrawalStatus === 'NO_PESTICIDE'
      ? 'Không sử dụng thuốc BVTV'
      : withdrawalStatus === 'PASSED'
        ? 'Đạt chuẩn An Toàn'
        : 'Chưa đủ thời gian cách ly'

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.mockHeader}>
        <h1>DX-AgriMarket</h1>
        <p>Truy xuất Nguồn gốc Nông sản</p>
      </div>

      {/* Block 1: Product & Lot */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.lotName}>{lot.commodity}</h2>
          <Pill tone={statusTone}>{statusLabel}</Pill>
        </div>
        <div className={styles.detailList}>
          <div className={styles.detailItem}>
            <span className={styles.label}>Mã lô:</span>
            <span className={styles.value}>{lot.lot_code}</span>
          </div>
          {lot.actual_weight_kg && (
            <div className={styles.detailItem}>
              <span className={styles.label}>Khối lượng:</span>
              <span className={styles.value}>{lot.actual_weight_kg} kg</span>
            </div>
          )}
          {lot.quality_grade && (
            <div className={styles.detailItem}>
              <span className={styles.label}>Phân loại:</span>
              <span className={styles.value}>{lot.quality_grade}</span>
            </div>
          )}
          {lot.packaging_type && (
            <div className={styles.detailItem}>
              <span className={styles.label}>Quy cách:</span>
              <span className={styles.value}>{lot.packaging_type}</span>
            </div>
          )}
          <div className={styles.detailItem}>
            <span className={styles.label}>Ngày thu hoạch:</span>
            <span className={styles.value}>
              {new Date(lot.harvest_date).toLocaleDateString('vi-VN')}
            </span>
          </div>
        </div>

        {/* Block 2: Origin */}
        <div className={styles.certBox} style={{ background: '#e3f2fd', color: '#1565c0', marginBottom: '1rem' }}>
          <strong>Nguồn gốc</strong>
          <p>Hợp tác xã: {lot.htx_profile?.name || '—'}</p>
          {lot.htx_profile?.address && <p>Địa chỉ: {lot.htx_profile.address}</p>}
          {household && <p>Nông hộ: {household.owner_name}</p>}
          {firstParcel && <p>Mã thửa: {firstParcel.parcel_code} • Diện tích: {firstParcel.area_ha} ha</p>}
        </div>

        {/* Block 3: Withdrawal Safety */}
        <div className={styles.certBox}>
          <strong>An toàn thuốc BVTV</strong>
          {withdrawalStatus === 'NO_PESTICIDE' ? (
            <p>Không sử dụng thuốc bảo vệ thực vật trong quá trình canh tác.</p>
          ) : (
            <p>
              Thuốc cuối cùng: {lastSpray?.activities[0]?.product_name || '—'}.
              Thời gian cách ly: {withdrawalDays} ngày / yêu cầu {requiredDays} ngày.
              {withdrawalStatus === 'PASSED' ? ' ✅ ĐẠT' : ' ❌ CHƯA ĐẠT'}
            </p>
          )}
        </div>
      </div>

      {/* Block 4: Timeline */}
      {journalEntries.length > 0 && (
        <div className={styles.card} style={{ marginTop: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 600 }}>
            Nhật ký canh tác ({journalEntries.length} hoạt động)
          </h3>
          <div className={styles.detailList}>
            {journalEntries.map((entry) => (
              <div key={entry.id} className={styles.detailItem} style={{ flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500 }}>
                    {ACTIVITY_VN[entry.activity_type] || entry.activity_type}
                  </span>
                  <span className={styles.label}>
                    {new Date(entry.entry_date).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                {entry.activities[0]?.activity_detail && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--muted-foreground, #6b7280)' }}>
                    {entry.activities[0].activity_detail}
                    {entry.activities[0].product_name && ` • ${entry.activities[0].product_name}`}
                    {entry.activities[0].dosage && ` (${entry.activities[0].dosage})`}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted-foreground, #6b7280)', marginTop: '1.5rem' }}>
        Dữ liệu truy xuất từ hệ thống DX-AgriMarket. Ngày tạo lô: {new Date(lot.created_at).toLocaleDateString('vi-VN')}
      </p>
    </div>
  )
}
