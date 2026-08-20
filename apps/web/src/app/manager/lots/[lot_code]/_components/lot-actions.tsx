// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import styles from '../lot-detail.module.css'

export function LotActions({ lotCode }: { lotCode: string }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [labelQuantity, setLabelQuantity] = useState(100)

  const [showScanner, setShowScanner] = useState(false)

  const handleExport = () => {
    setIsExporting(true)
    setTimeout(() => {
      setIsExporting(false)
      setShowConfirm(false)
      setShowPrint(true)
    }, 1000)
  }

  const handleSimulateScan = () => {
    setShowScanner(true)
    setTimeout(() => {
      window.open(`/q/${lotCode}?status=valid`, '_blank')
      setShowScanner(false)
    }, 2000)
  }

  return (
    <>
      <div className={styles.actionRow}>
        <button className={styles.btnSecondary} onClick={handleSimulateScan}>Quét QR (Camera Mock)</button>
        <button className={styles.btnSecondary}>Lưu nháp</button>
        <button className={styles.btnPrimary} onClick={() => setShowConfirm(true)}>
          <span>Xuất QR</span>
        </button>
      </div>

      {showConfirm && (
        <div className={styles.overlay} onClick={() => setShowConfirm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Xác nhận Xuất QR</h2>
            <p style={{ marginBottom: '1.5rem', color: 'var(--color-text-muted)' }}>
              Bạn đang chuẩn bị xuất mã QR truy xuất nguồn gốc cho lô hàng <strong>{lotCode}</strong>.
              Hành động này không thể hoàn tác và dữ liệu lô hàng sẽ bị đóng băng.
            </p>
            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowConfirm(false)}>Hủy</button>
              <button type="button" className={styles.submitBtn} onClick={handleExport} disabled={isExporting}>
                {isExporting ? 'Đang xuất...' : 'Đồng ý Xuất'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrint && (
        <div className={styles.overlay} onClick={() => setShowPrint(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Xuất QR Thành Công!</h2>
            <p style={{ marginBottom: '1rem', color: 'var(--color-success)', fontWeight: 500 }}>
              Mã QR đã được sinh thành công cho lô hàng {lotCode}.
            </p>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Số lượng tem cần in:</label>
              <input 
                type="number" 
                value={labelQuantity} 
                onChange={e => setLabelQuantity(Number(e.target.value))}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
              />
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowPrint(false)}>Đóng</button>
              <button type="button" className={styles.submitBtn} onClick={() => { alert(`Đã tải xuống file in cho ${labelQuantity} tem.`); setShowPrint(false) }}>
                Tải file in (PDF)
              </button>
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <div className={styles.overlay}>
          <div style={{ background: '#000', padding: '2rem', borderRadius: '16px', textAlign: 'center', color: 'white' }}>
            <div style={{ width: '250px', height: '250px', border: '4px dashed rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
              <span style={{ animation: 'pulse 1s infinite' }}>[Đang quét...]</span>
            </div>
            <p>Mô phỏng quét QR Camera</p>
          </div>
        </div>
      )}
    </>
  )
}
