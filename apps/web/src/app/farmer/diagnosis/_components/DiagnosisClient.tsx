// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { Pill } from '@/components/ui'
import styles from '../diagnosis.module.css'
import { getDiagnosisHistory } from '../actions'
import { DiagnosisHistoryItem } from '@/domain/disease/ports/disease-report.port'
import { useOfflineSync } from '@/lib/hooks/useOfflineSync'

interface DiagnosisClientProps {
  initialParcels: { id: string; parcel_code: string; name: string }[]
  initialHistory: DiagnosisHistoryItem[]
}

export function DiagnosisClient({ initialParcels, initialHistory }: DiagnosisClientProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedParcelId, setSelectedParcelId] = useState<string>(initialParcels[0]?.id || '')
  
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<{ disease: string; confidence: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  
  const [history, setHistory] = useState<DiagnosisHistoryItem[]>(initialHistory)

  const { isOnline, queueCount, isSyncing, saveToQueue } = useOfflineSync()

  // [M2] Validate file size ≤ 5MB trước khi accept
  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setErrorMsg('Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 5MB.')
        return;
      }
      setSelectedFile(file)
      setResult(null)
      setErrorMsg(null)
    }
  }

  const handleAnalyze = async () => {
    if (!selectedFile || !selectedParcelId) {
      setErrorMsg('Vui lòng chọn thửa đất và hình ảnh.')
      return
    }

    setIsAnalyzing(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    
    if (!isOnline) {
      const saved = await saveToQueue(selectedParcelId, selectedFile)
      if (saved) {
        setSuccessMsg('Đang ngoại tuyến. Đã lưu ảnh vào hàng đợi chờ đồng bộ.')
        setSelectedFile(null)
        setResult(null)
      } else {
        setErrorMsg('Không thể lưu ảnh vào bộ nhớ tạm.')
      }
      setIsAnalyzing(false)
      return
    }

    try {
      const formData = new FormData()
      formData.append('image', selectedFile)
      formData.append('parcel_id', selectedParcelId)

      const response = await fetch('/api/diagnosis', {
        method: 'POST',
        body: formData,
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.error?.message || 'Có lỗi xảy ra khi chẩn đoán')
      }

      setResult({
        disease: json.data.disease_name,
        confidence: json.data.confidence_score,
      })

      // Refresh history
      const updatedHistory = await getDiagnosisHistory()
      setHistory(updatedHistory)
      
    } catch (error: any) {
      setErrorMsg(error.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const resetForm = () => {
    setSelectedFile(null)
    setResult(null)
    setErrorMsg(null)
    setSuccessMsg(null)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Chẩn đoán bệnh tự động</h1>
        <p className={styles.subtitle}>Tải ảnh lá bệnh lên để AI hỗ trợ nhận diện. Kết quả sẽ tự động được lưu và thông báo cho Cán bộ Kỹ thuật.</p>
        
        {!isOnline && (
          <div className={styles.offlineBanner}>
            ⚠️ Bạn đang ngoại tuyến. Hình ảnh sẽ được lưu vào máy và tự động tải lên khi có mạng (Đang chờ: {queueCount}).
          </div>
        )}
        {isOnline && queueCount > 0 && (
          <div className={styles.syncBanner}>
            🔄 Đang đồng bộ {queueCount} hình ảnh từ bộ nhớ tạm... {isSyncing ? '(Đang xử lý)' : ''}
          </div>
        )}
      </div>

      <div className={styles.layout}>
        {/* Left Column: Upload & Result */}
        <div className={styles.mainPanel}>
          <div className={styles.uploadArea}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Chọn thửa đất:</label>
              <select 
                className={styles.select}
                value={selectedParcelId}
                onChange={(e) => setSelectedParcelId(e.target.value)}
              >
                {initialParcels.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.parcel_code})</option>
                ))}
              </select>
            </div>

            <input type="file" id="fileInput" accept="image/jpeg, image/png" className={styles.fileInput} onChange={handleFileSelect} />
            <label htmlFor="fileInput" className={styles.uploadLabel}>
              {selectedFile ? (
                <span>Đã chọn: <strong>{selectedFile.name}</strong></span>
              ) : (
                <span>Nhấn để chọn ảnh (JPEG, PNG. Tối đa 5MB)</span>
              )}
            </label>

            {errorMsg && (
              <div className={styles.errorBox}>
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className={styles.successBox}>
                {successMsg}
              </div>
            )}

            {selectedFile && !result && (
              <button className={styles.analyzeBtn} onClick={handleAnalyze} disabled={isAnalyzing}>
                {isAnalyzing ? 'Đang phân tích và gửi cho CBKT...' : 'Bắt đầu chẩn đoán'}
              </button>
            )}
          </div>

          {result && (
            <div className={styles.resultArea}>
              <h3>Kết quả chẩn đoán:</h3>
              {result.confidence < 70 && (
                <div className={styles.warningBox}>
                  ⚠️ <strong>Độ tự tin thấp:</strong> Hình ảnh có thể mờ hoặc không rõ triệu chứng. Cán bộ Kỹ thuật đã nhận được thông báo và sẽ kiểm tra thêm.
                </div>
              )}
              
              <ul className={styles.resultList}>
                <li className={styles.resultItem}>
                  <span className={styles.diseaseName}>{result.disease}</span>
                  <span className={styles.confidenceScore} style={{ color: result.confidence >= 70 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                    {result.confidence.toFixed(1)}%
                  </span>
                </li>
              </ul>
              
              <p className={styles.aiNote}>* AI không đưa ra khuyến nghị điều trị. Hãy tham khảo ý kiến chuyên gia. CBKT đã nhận được kết quả này.</p>

              <button className={styles.analyzeBtn} onClick={resetForm}>
                Chẩn đoán hình ảnh khác
              </button>
            </div>
          )}
        </div>

        {/* Right Column: History */}
        <div className={styles.sidePanel}>
          <h3>Lịch sử chẩn đoán</h3>
          {history.length === 0 ? (
            <p className={styles.emptyHistory}>Chưa có lịch sử chẩn đoán.</p>
          ) : (
            history.map(h => (
              <div key={h.id} className={styles.historyCard}>
                <div className={styles.historyHeader}>
                  <span className={styles.historyDate}>{new Date(h.detection_date).toLocaleDateString('vi-VN')}</span>
                  <Pill tone={h.status === 'SENT_TO_OFFICER' || h.status === 'PENDING' ? 'amber' : h.status === 'RESOLVED' ? 'green' : 'neutral'}>
                    {h.status === 'SENT_TO_OFFICER' || h.status === 'PENDING' ? 'Chờ CBKT xem' : h.status === 'RESOLVED' ? 'Đã xử lý' : h.status}
                  </Pill>
                </div>
                <div className={styles.historyBody}>
                  {h.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.photo_url} alt="Disease" className={styles.historyImage} />
                  ) : (
                    <div className={styles.historyImagePlaceholder}>Ảnh không khả dụng</div>
                  )}
                  <div className={styles.historyDetails}>
                    <div className={styles.historyParcel}>Thửa: {h.parcel_code}</div>
                    <span className={styles.historyDisease}>{h.ai_disease_name} ({h.ai_confidence.toFixed(1)}%)</span>
                    {h.treatment_recommendation && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f0f9ff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                        <strong>Hướng dẫn CBKT:</strong> {h.treatment_recommendation}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
