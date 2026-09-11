// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { PrismaDiseaseReportRepository } from '@/infrastructure/db/farm/PrismaDiseaseReportRepository';
import { logger } from '@/lib/logger';
import { Pill } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import styles from './diseases.module.css';

export const metadata = {
  title: 'Duyệt Báo cáo Bệnh | Officer',
};

export default async function OfficerDiseasesPage() {
  const session = await auth();
  if (!session || !session.user || session.user.role !== 'officer') {
    redirect('/auth/signin');
  }

  const repository = new PrismaDiseaseReportRepository();
  const rawReports = await repository.findPendingReports();

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
      <header className={styles.header}>
        <h1 className={styles.title}>Danh sách Báo cáo Bệnh cần duyệt</h1>
      </header>

      {reports.length === 0 ? (
        <div className={styles.empty}>
          Không có báo cáo bệnh nào đang chờ duyệt.
        </div>
      ) : (
        <div className={styles.grid}>
          {reports.map((report) => (
            <div key={report.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.diseaseName}>{report.ai_disease_name}</h3>
                  <p className={styles.meta}>Nông hộ: {report.farmer_name}</p>
                </div>
                <Pill tone="amber">PENDING</Pill>
              </div>

              {report.photo_url && (
                <div className={styles.imageWrapper}>
                  <Image 
                    src={report.photo_url} 
                    alt="Ảnh bệnh" 
                    fill 
                    unoptimized
                    className={styles.reportImage}
                  />
                </div>
              )}

              <div className={styles.details}>
                <div><strong>Thửa đất:</strong> {report.parcel_code}</div>
                <div><strong>AI Tự tin:</strong> {(report.ai_confidence * 100).toFixed(1)}%</div>
                <div><strong>Ngày gửi:</strong> {new Date(report.detection_date).toLocaleDateString('vi-VN')}</div>
              </div>

              <Link href={`/officer/diseases/${report.id}`} style={{ textDecoration: 'none' }}>
                <Button variant="primary" style={{ width: '100%' }}>Xem chi tiết & Duyệt</Button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
