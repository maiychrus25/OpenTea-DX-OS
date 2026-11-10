// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Pill } from '@/components/ui'
import { XCircle, AlertTriangle, Clock, Check, X } from 'lucide-react'
import styles from './qr.module.css'
import { GetLotTraceDataUseCase } from '@/application/useCases/get-lot-trace-data-usecase'
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'
import { BRAND_NAME } from '@/lib/brand'

export const runtime = 'nodejs'

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

export default async function QrTracePage({ params, searchParams }: PageProps & { searchParams: Promise<{ status?: string }> }) {
  const { lot_code } = await params
  let decodedCode: string
  try {
    decodedCode = decodeURIComponent(lot_code).normalize('NFC')
  } catch {
    decodedCode = lot_code
  }
  // Boundary guard: empty/long/special
  if (!decodedCode || decodedCode.length > 100 || /[\/\r\n?#]/.test(decodedCode)) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <div className={`${styles.iconWrapper} ${styles.iconWrapperError}`}>
            <XCircle size={32} aria-hidden="true" />
          </div>
          <h1 className={styles.errorTitle}>Mã QR không hợp lệ</h1>
          <p className={styles.errorDesc}>Mã lô chứa ký tự không hợp lệ. Vui lòng kiểm tra lại tem dán.</p>
        </div>
      </div>
    )
  }

  // Allow overriding status via query param for testing error pages
  const { status: overrideStatus } = await (searchParams || Promise.resolve({} as { status?: string }))

  if (overrideStatus === 'invalid' || overrideStatus === 'not-found') {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <div className={`${styles.iconWrapper} ${styles.iconWrapperError}`}>
            <XCircle size={32} aria-hidden="true" />
          </div>
          <h1 className={styles.errorTitle}>Không tìm thấy dữ liệu</h1>
          <p className={styles.errorDesc}>Mã QR này không tồn tại trong hệ thống hoặc đã bị xóa. Vui lòng kiểm tra lại tem dán.</p>
        </div>
      </div>
    )
  }

  if (overrideStatus === 'revoked') {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <div className={`${styles.iconWrapper} ${styles.iconWrapperRevoked}`}>
            <AlertTriangle size={32} aria-hidden="true" />
          </div>
          <h1 className={styles.errorTitle}>Lô hàng đã bị thu hồi</h1>
          <p className={styles.errorDesc}>
            Mã QR này thuộc về lô hàng <strong>{decodedCode}</strong> nhưng đã bị thu hồi bởi Cán bộ Kỹ thuật do không đạt tiêu chuẩn an toàn. Không sử dụng sản phẩm này.
          </p>
        </div>
      </div>
    )
  }

  if (overrideStatus === 'expired') {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <div className={`${styles.iconWrapper} ${styles.iconWrapperExpired}`}>
            <Clock size={32} aria-hidden="true" />
          </div>
          <h1 className={styles.errorTitle}>Lô hàng đã hết hạn</h1>
          <p className={styles.errorDesc}>
            Thời hạn sử dụng của lô hàng <strong>{decodedCode}</strong> đã kết thúc. Vui lòng xem kỹ hạn sử dụng trên bao bì thực tế.
          </p>
        </div>
      </div>
    )
  }

  // BUG-05 fix: use immutable snapshot via GetLotTraceDataUseCase (same as /lot) instead of live DB query
  const repo = new PrismaLotTraceRepository()
  const useCase = new GetLotTraceDataUseCase(repo)
  let trace: Awaited<ReturnType<typeof useCase.execute>> | null = null
  try {
    trace = await useCase.execute(decodedCode)
  } catch (e) {
    const { NotFoundError } = await import('@/domain/errors')
    if (e instanceof NotFoundError) trace = null
    else throw e
  }

  if (!trace) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <div className={`${styles.iconWrapper} ${styles.iconWrapperError}`}>
            <XCircle size={32} aria-hidden="true" />
          </div>
          <h1 className={styles.errorTitle}>Không tìm thấy dữ liệu</h1>
          <p className={styles.errorDesc}>Mã QR này không tồn tại trong hệ thống hoặc đã bị xóa. Vui lòng kiểm tra lại tem dán.</p>
        </div>
      </div>
    )
  }

  // Derive withdrawal status from snapshot journal_summaries (APPROVED only)
  const spraySummaries = trace.journal_summaries.filter((s) => s.activity_type === 'SPRAYING')
  const lastSpray = spraySummaries.length > 0 ? spraySummaries[spraySummaries.length - 1] : null
  let withdrawalStatus: 'NO_PESTICIDE' | 'PASSED' | 'FAILED' = 'NO_PESTICIDE'
  let withdrawalDays = 0
  let requiredDays = 0

  if (lastSpray) {
    requiredDays = lastSpray.withdrawal_days ?? 14
    // Use snapshot's computed safety if available — deterministic (no new Date() fallback)
    if (trace.latest_safe_harvest_date) {
      const harvestDate = trace.packaging_date ? new Date(trace.packaging_date) : new Date(trace.created_at)
      const safeDate = new Date(trace.latest_safe_harvest_date)
      withdrawalStatus = harvestDate >= safeDate ? 'PASSED' : 'FAILED'
      // days elapsed derived from harvest vs last spray entry (UTC-safe)
      const sprayDate = new Date(lastSpray.entry_date)
      withdrawalDays = Math.max(0, Math.floor((harvestDate.getTime() - sprayDate.getTime()) / (1000 * 60 * 60 * 24)))
    } else {
      withdrawalStatus = trace.is_harvest_safe ? 'PASSED' : 'FAILED'
      // For display, compute days elapsed from packaging_date vs last spray
      const harvestDate = trace.packaging_date ? new Date(trace.packaging_date) : new Date(trace.created_at)
      const sprayDate = new Date(lastSpray.entry_date)
      withdrawalDays = Math.max(0, Math.floor((harvestDate.getTime() - sprayDate.getTime()) / (1000 * 60 * 60 * 24)))
    }
  } else if (!trace.is_harvest_safe) {
    withdrawalStatus = 'FAILED'
  }

  const statusTone = withdrawalStatus === 'PASSED' || withdrawalStatus === 'NO_PESTICIDE' ? 'green' : 'neutral'
  const statusLabel =
    withdrawalStatus === 'NO_PESTICIDE' ? 'Không sử dụng thuốc BVTV' : withdrawalStatus === 'PASSED' ? 'Đạt chuẩn An Toàn' : 'Chưa đủ thời gian cách ly'

  const firstParcel = trace.parcels[0]

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.mockHeader}>
        <h1>{BRAND_NAME}</h1>
        <p>Truy xuất Nguồn gốc Nông sản</p>
      </div>

      {/* Block 1: Product & Lot */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.lotName}>{trace.commodity}</h2>
          <Pill tone={statusTone}>{statusLabel}</Pill>
        </div>
        <div className={styles.detailList}>
          <div className={styles.detailItem}>
            <span className={styles.label}>Mã lô:</span>
            <span className={styles.value}>{trace.lot_code}</span>
          </div>
          {trace.total_weight_kg !== null && trace.total_weight_kg !== undefined && (
            <div className={styles.detailItem}>
              <span className={styles.label}>Khối lượng:</span>
              <span className={styles.value}>{trace.total_weight_kg} kg</span>
            </div>
          )}
          {trace.quality_grade && (
            <div className={styles.detailItem}>
              <span className={styles.label}>Phân loại:</span>
              <span className={styles.value}>{trace.quality_grade}</span>
            </div>
          )}
          {trace.packaging_spec && (
            <div className={styles.detailItem}>
              <span className={styles.label}>Quy cách:</span>
              <span className={styles.value}>{trace.packaging_spec}</span>
            </div>
          )}
          <div className={styles.detailItem}>
            <span className={styles.label}>Ngày thu hoạch:</span>
            <span className={styles.value}>{trace.packaging_date ? new Date(trace.packaging_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}</span>
          </div>
        </div>

        {/* Block 2: Origin */}
        <div className={`${styles.certBox} ${styles.originBox}`}>
          <strong>Nguồn gốc</strong>
          <p>Hợp tác xã: {trace.htx_name || '—'}</p>
          {firstParcel && <p>Mã thửa: {firstParcel.parcel_code} • Diện tích: {firstParcel.area_ha} ha</p>}
          {trace.parcels.length > 1 && <p className={styles.mutedText}>+ {trace.parcels.length - 1} thửa khác</p>}
        </div>

        {/* Block 3: Withdrawal Safety */}
        <div className={styles.certBox}>
          <strong>An toàn thuốc BVTV</strong>
          {withdrawalStatus === 'NO_PESTICIDE' ? (
            <p>Không sử dụng thuốc bảo vệ thực vật trong quá trình canh tác.</p>
          ) : (
            <p className={styles.withdrawalRow}>
              <span>
                Thuốc cuối cùng: {lastSpray?.product_name || '—'}. Thời gian cách ly: {withdrawalDays} ngày / yêu cầu {requiredDays} ngày.
              </span>
              {withdrawalStatus === 'PASSED' ? (
                <span className={styles.badgePass}>
                  <Check size={16} aria-hidden="true" /> ĐẠT
                </span>
              ) : (
                <span className={styles.badgeFail}>
                  <X size={16} aria-hidden="true" /> CHƯA ĐẠT
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Block 4: Timeline */}
      {trace.journal_summaries.length > 0 && (
        <div className={`${styles.card} ${styles.cardSpacing}`}>
          <h3 className={styles.timelineTitle}>Nhật ký canh tác ({trace.journal_summaries.length} hoạt động)</h3>
          <div className={styles.detailList}>
            {trace.journal_summaries.map((entry, idx) => (
              <div key={`${new Date(entry.entry_date).toISOString()}-${entry.activity_type}-${entry.performed_by}-${idx}`} className={`${styles.detailItem} ${styles.detailItemColumn}`}>
                <div className={styles.timelineRow}>
                  <span className={styles.timelineActivity}>{ACTIVITY_VN[entry.activity_type] || entry.activity_type}</span>
                  <span className={styles.label}>{new Date(entry.entry_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
                </div>
                {entry.activity_detail && (
                  <span className={styles.timelineDetail}>
                    {entry.activity_detail}
                    {entry.product_name && ` • ${entry.product_name}`}
                    {entry.dosage && ` (${entry.dosage})`}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className={styles.footerNote}>Dữ liệu truy xuất từ hệ thống {BRAND_NAME}. Ngày tạo lô: {new Date(trace.created_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
    </div>
  )
}
