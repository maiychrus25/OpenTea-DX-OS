// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PageHeader } from '@/components/ui/PageHeader'
import { Bug, ImageIcon, Layers, CalendarDays, ArrowRight } from 'lucide-react'
import { Stats } from '@/components/features/officer-web/parts'
import React from 'react';
import Link from 'next/link';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { CoreGatewayClient } from '@/infrastructure/core/core-gateway.client';
import { GatewayDiseaseReportReader } from '@/infrastructure/core/gateway-disease-report-reader';
import { logger } from '@/lib/logger';
import { Pill } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import styles from './diseases.module.css';
import { ReportPhoto } from '@/components/features/disease/ReportPhoto';
import { diseaseStatusLabel } from '@/domain/disease/disease-status-label';

// The queue lists pending reports only.
const PENDING = diseaseStatusLabel('PENDING');
import { displayDiseaseName } from '@/domain/disease/display-disease-name';

export const metadata = {
  title: 'Duyệt Báo cáo Bệnh | Officer',
};

export default async function OfficerDiseasesPage() {
  const session = await auth();
  if (!session || !session.user || session.user.role !== 'officer') {
    redirect('/auth/signin');
  }

  const reader = new GatewayDiseaseReportReader(new CoreGatewayClient(session.user.role));
  const rawReports = await reader.findPendingReports();

  const { MinioStorageAdapter } = await import('@/infrastructure/storage/minio-storage.adapter');
  const storageAdapter = new MinioStorageAdapter();
  
  const reports = await Promise.all(rawReports.map(async (r) => {
    if (r.photo_minio_key) {
      try {
        r.photo_url = await storageAdapter.getPresignedUrl(r.photo_minio_key);
      } catch (e) {
        logger.error('Failed to generate presigned URL', { key: r.photo_minio_key, error: e });
      }
    }
    return r;
  }));

  return (
    <div className={styles.container}>
      <PageHeader
        icon={<Bug size={28} />}
        title="Danh sách Báo cáo Bệnh cần duyệt"
        description="Ảnh chẩn đoán do nông hộ gửi, chờ cán bộ kỹ thuật xác nhận"
      />

      <Stats items={[
        { label: 'Báo cáo chờ duyệt', value: reports.length, icon: <Bug /> },
        { label: 'Báo cáo có ảnh', value: reports.filter(report => report.photo_url).length, icon: <ImageIcon /> },
      ]} />

      {reports.length === 0 ? (
        <div className={styles.empty}>
          Không có báo cáo bệnh nào đang chờ duyệt.
        </div>
      ) : (
        <div className={styles.grid}>
          {reports.map((report) => (
            <div key={report.id} className={styles.card}>
              {report.photo_url && (
                <div className={styles.imageWrapper}>
                  <ReportPhoto src={report.photo_url} className={styles.reportImage} />
                </div>
              )}

              <div className={styles.cardHead}>
                <span className={styles.mark} aria-hidden="true"><Bug size={24} /></span>
                <div className={styles.headText}>
                  <h3 className={styles.diseaseName}>{displayDiseaseName(report)}</h3>
                  <p className={styles.meta}>Nông hộ: {report.farmer_name}</p>
                </div>
                <Pill tone={PENDING.tone}>{PENDING.label}</Pill>
              </div>

              <dl className={styles.facts}>
                <div><dt><Layers size={18} aria-hidden="true" />Thửa đất</dt><dd>{report.parcel_code}</dd></div>
                <div><dt><CalendarDays size={18} aria-hidden="true" />Ngày gửi</dt><dd>{new Date(report.detection_date).toLocaleDateString('vi-VN')}</dd></div>
              </dl>

              <div className={styles.confidence}>
                <span className={styles.confidenceRow}>Độ tin cậy của AI <strong>{(report.ai_confidence * 100).toFixed(1)}%</strong></span>
                <progress max={1} value={report.ai_confidence} aria-label="Độ tin cậy của AI" />
              </div>

              <div className={styles.cardActions}>
                <Link href={`/officer/diseases/${report.id}`}>
                  <Button variant="primary" className={styles.reviewBtn}>
                    Xem chi tiết & Duyệt <ArrowRight size={18} aria-hidden="true" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
