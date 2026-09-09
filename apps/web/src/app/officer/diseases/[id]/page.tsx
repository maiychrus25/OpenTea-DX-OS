'use client';
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Pill } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import styles from './detail.module.css';

interface ReportData {
  id: string;
  ai_disease_name: string;
  ai_confidence: number;
  farmer_name: string;
  parcel_code: string;
  detection_date: string;
  photo_url?: string;
}

export default function OfficerDiseaseDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [report, setReport] = useState<ReportData | null>(null);
  const [treatment, setTreatment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // In a real implementation, we'd fetch the specific report.
    // For this story, since there's no GET /api/officer/diseases/[id], we'll fetch all and filter,
    // or we can just fetch all pending and find the one. 
    // Ideally, we should have added findById API, but we'll implement a quick fetch here.
    fetch('/api/officer/diseases')
      .then(res => res.json())
      .then(data => {
        if (data.data) {
          const found = data.data.find((r: ReportData) => r.id === params.id);
          if (found) {
            setReport(found);
          } else {
            setError('Không tìm thấy báo cáo bệnh (hoặc đã duyệt).');
          }
        }
      })
      .catch(() => {
        setError('Lỗi khi tải dữ liệu.');
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleReview = async (status: 'CONFIRMED' | 'REJECTED') => {
    if (status === 'CONFIRMED' && !treatment.trim()) {
      setError('Vui lòng nhập Hướng dẫn điều trị trước khi duyệt.');
      return;
    }

    setSubmitting(true);
    setError('');
    
    try {
      const res = await fetch(`/api/officer/diseases/${params.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          treatment_recommendation: treatment
        })
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error?.message || 'Có lỗi xảy ra');
      }

      // Success
      router.push('/officer/diseases');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className={styles.container}>Đang tải...</div>;
  if (!report) return <div className={styles.container}>{error}</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/officer/diseases" className={styles.backLink}>&larr; Quay lại</Link>
        <h1 className={styles.title}>Chi tiết Báo cáo bệnh</h1>
      </header>

      {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}

      <div className={styles.content}>
        <div className={styles.card}>
          <div className={styles.sectionTitle}>Thông tin chẩn đoán từ AI</div>
          
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

          <div className={styles.gridInfo}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Tên bệnh AI chẩn đoán</span>
              <span className={styles.infoValue}>{report.ai_disease_name}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Độ tự tin</span>
              <span className={styles.infoValue}>{(report.ai_confidence * 100).toFixed(1)}%</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Thửa đất</span>
              <span className={styles.infoValue}>{report.parcel_code}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Nông hộ</span>
              <span className={styles.infoValue}>{report.farmer_name}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Ngày gửi</span>
              <span className={styles.infoValue}>{new Date(report.detection_date).toLocaleDateString('vi-VN')}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Trạng thái</span>
              <Pill tone="amber">PENDING</Pill>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.sectionTitle}>Phản hồi & Hướng dẫn điều trị</div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Nhập hướng dẫn (Bắt buộc khi Duyệt):</label>
            <textarea 
              className={styles.textarea}
              placeholder="VD: Sử dụng thuốc A liều lượng B, phun cách ly 7 ngày..."
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className={styles.actions}>
            <Button 
              variant="secondary" 
              onClick={() => handleReview('REJECTED')}
              disabled={submitting}
            >
              Từ chối
            </Button>
            <Button 
              variant="primary" 
              onClick={() => handleReview('CONFIRMED')}
              disabled={submitting}
            >
              Phê duyệt
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
