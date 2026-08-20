// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { Info } from 'lucide-react';
import { LotTraceData } from '@/domain/entities/lot-trace-data';
import { Pill } from '@/components/ui/Pill/Pill';
import styles from '../trace.module.css';

interface TraceViewProps {
  data: LotTraceData;
  qrDataUri?: string;
  pageUrl?: string;
}

export function TraceView({ data, qrDataUri, pageUrl }: TraceViewProps) {
  const {
    lot_code,
    commodity,
    status,
    htx_name,
    packaging_date,
    packaging_spec,
    total_weight_kg,
    is_harvest_safe,
    parcels,
    journal_summaries,
    certificate_keys,
  } = data;

  return (
    <div className={styles.traceShell}>
      <header className={styles.traceHeader}>
        <h1>Truy xuất nguồn gốc</h1>
        <p>DX AgriMarket</p>
      </header>

      {/* QR Code Section */}
      {qrDataUri && (
        <section className={styles.section} style={{ textAlign: 'center' }}>
          <h2 className={styles.sectionTitle}>Mã QR lô hàng</h2>
          <img src={qrDataUri} alt={`QR Code — ${lot_code}`} style={{ width: 200, height: 200, margin: '0 auto' }} />
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted, #666)' }}>
            Quét mã QR để xem thông tin truy xuất
          </p>
          {pageUrl && (
            <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-muted, #999)', wordBreak: 'break-all' }}>
              {pageUrl}
            </p>
          )}
        </section>
      )}

      {/* Section 1: Product & Lot info */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Thông tin sản phẩm</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Sản phẩm</span>
            <span className={styles.infoValue}>{commodity}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Mã lô</span>
            <span className={styles.infoValue}>{lot_code}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Hợp tác xã</span>
            <span className={styles.infoValue}>{htx_name || 'Đang cập nhật'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Trạng thái</span>
            <span className={styles.infoValue}>
              <Pill tone={status === 'QR_EXPORTED' ? 'green' : 'neutral'}>
                {status}
              </Pill>
            </span>
          </div>
          {packaging_date && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Ngày đóng gói</span>
              <span className={styles.infoValue}>{new Date(packaging_date).toLocaleDateString('vi-VN')}</span>
            </div>
          )}
          {total_weight_kg !== null && total_weight_kg !== undefined && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Tổng khối lượng</span>
              <span className={styles.infoValue}>{total_weight_kg} kg</span>
            </div>
          )}
          {packaging_spec && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Quy cách đóng gói</span>
              <span className={styles.infoValue}>{packaging_spec}</span>
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Origin */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Nguồn gốc thửa đất</h2>
        {parcels && parcels.length > 0 ? (
          <div className={styles.infoGrid}>
            {parcels.map((parcel, idx) => (
              <div key={idx} className={styles.infoItem}>
                <span className={styles.infoValue}>{parcel.household_name}</span>
                <span className={styles.infoLabel}>Thửa: {parcel.parcel_code} - {parcel.area_ha} ha</span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.infoLabel}>Không có thông tin thửa đất.</p>
        )}
      </section>

      {/* Section 3: Safety check */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Kiểm tra an toàn</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Trạng thái cách ly</span>
            <span className={styles.infoValue}>
              {is_harvest_safe ? (
                <Pill tone="green">An toàn</Pill>
              ) : (
                <Pill tone="amber">Cần kiểm tra</Pill>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* Section 4: Journal timeline */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Nhật ký canh tác</h2>
        {journal_summaries && journal_summaries.length > 0 ? (
          <div className={styles.timeline}>
            {journal_summaries.map((journal, idx) => (
              <div key={idx} className={styles.timelineItem}>
                <div className={styles.timelineDot}></div>
                <div className={styles.timelineContent}>
                  <span className={styles.timelineDate}>{new Date(journal.entry_date).toLocaleDateString('vi-VN')}</span>
                  <span className={styles.timelineActivity}>{journal.activity_type}</span>
                  {journal.product_name && (
                    <span className={styles.timelineDetail}>Sản phẩm: {journal.product_name}{journal.dosage ? ` — ${journal.dosage}` : ''}</span>
                  )}
                  {journal.withdrawal_days !== null && journal.withdrawal_days > 0 && (
                    <span className={styles.timelineDetail}>⏳ Thời gian cách ly: {journal.withdrawal_days} ngày</span>
                  )}
                  <span className={styles.timelinePerson}>Thực hiện bởi: {journal.performed_by}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.infoLabel}>Không có nhật ký.</p>
        )}
      </section>

      {/* Section 5: Certifications */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Giấy chứng nhận</h2>
        {certificate_keys && certificate_keys.length > 0 ? (
          <ul className={styles.certList}>
            {certificate_keys.map((cert, idx) => (
              <li key={idx} className={styles.certItem}>
                <a 
                  href={`/api/lot/${lot_code}/certificate?key=${encodeURIComponent(cert)}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={styles.certLink}
                >
                  Xem giấy chứng nhận {idx + 1}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.infoLabel}>Chưa có giấy chứng nhận.</p>
        )}
      </section>

      {/* Mandatory disclaimer */}
      <div className={styles.disclaimer}>
        <Info className={styles.disclaimerIcon} />
        <p>DX AgriMarket không chỉnh sửa hoặc xác nhận thay cho cán bộ kỹ thuật. Thông tin hiển thị được ghi nhận bởi cán bộ kỹ thuật được phân công.</p>
      </div>
    </div>
  );
}
