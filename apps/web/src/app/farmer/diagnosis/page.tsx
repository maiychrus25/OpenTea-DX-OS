// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { Pill } from '@/components/ui'
import styles from './diagnosis.module.css'

interface DiagnosisResult {
  disease: string
  confidence: number
}

interface DiagnosisHistory {
  id: string
  date: string
  image: string
  result: DiagnosisResult[]
  status: 'PENDING' | 'SENT_TO_OFFICER' | 'RESOLVED'
}

const MOCK_HISTORY: DiagnosisHistory[] = [
  {
    id: '1',
    date: '15/08/2026',
    image: 'IMG_20260815.jpg',
    result: [{ disease: 'Sâu khoang', confidence: 92 }],
    status: 'RESOLVED'
  }
]

export default function DiagnosisPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState<DiagnosisResult[] | null>(null)
  const [history, setHistory] = useState<DiagnosisHistory[]>(MOCK_HISTORY)
  const [showSendConfirm, setShowSendConfirm] = useState(false)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0])
      setResults(null)
    }
  }

  const handleAnalyze = () => {
    if (!selectedFile) return
    setIsAnalyzing(true)
    setTimeout(() => {
      // Mock AI response with multiple candidates and low confidence
      setResults([
        { disease: 'Đốm lá vi khuẩn', confidence: 65 },
        { disease: 'Đạo ôn', confidence: 15 },
      ])
      setIsAnalyzing(false)
    }, 1500)
  }

  const handleSendToOfficer = () => {
    setShowSendConfirm(false)
    setHistory(prev => [{
      id: Date.now().toString(),
      date: new Date().toLocaleDateString('vi-VN'),
      image: selectedFile?.name || 'unknown.jpg',
      result: results || [],
      status: 'SENT_TO_OFFICER'
    }, ...prev])
    setSelectedFile(null)
    setResults(null)
  }

  const highestConfidence = results ? Math.max(...results.map(r => r.confidence)) : 0

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Chẩn đoán bệnh tự động</h1>
        <p className={styles.subtitle}>Tải ảnh lá bệnh lên để AI hỗ trợ nhận diện (độ chính xác tùy thuộc chất lượng ảnh).</p>
      </div>

      <div className={styles.layout}>
        {/* Left Column: Upload & Result */}
        <div className={styles.mainPanel}>
          <div className={styles.uploadArea}>
            <input type="file" id="fileInput" accept="image/*" className={styles.fileInput} onChange={handleFileSelect} />
            <label htmlFor="fileInput" className={styles.uploadLabel}>
              {selectedFile ? (
                <span>Đã chọn: <strong>{selectedFile.name}</strong></span>
              ) : (
                <span>Nhấn để chọn ảnh từ thư viện hoặc chụp mới</span>
              )}
            </label>
            {selectedFile && (
              <button className={styles.analyzeBtn} onClick={handleAnalyze} disabled={isAnalyzing}>
                {isAnalyzing ? 'Đang phân tích...' : 'Bắt đầu chẩn đoán'}
              </button>
            )}
          </div>

          {results && (
            <div className={styles.resultArea}>
              <h3>Kết quả chẩn đoán:</h3>
              {highestConfidence < 70 && (
                <div className={styles.warningBox}>
                  ⚠️ <strong>Độ tự tin thấp:</strong> Hình ảnh có thể mờ hoặc không rõ triệu chứng. Vui lòng gửi cho Cán bộ Kỹ thuật để kiểm tra thêm.
                </div>
              )}
              
              <ul className={styles.resultList}>
                {results.map((r, i) => (
                  <li key={i} className={styles.resultItem}>
                    <span className={styles.diseaseName}>{r.disease}</span>
                    <span className={styles.confidenceScore} style={{ color: r.confidence >= 70 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                      {r.confidence}%
                    </span>
                  </li>
                ))}
              </ul>
              
              <p className={styles.aiNote}>* AI không đưa ra khuyến nghị điều trị. Hãy tham khảo ý kiến chuyên gia.</p>

              <button className={styles.sendBtn} onClick={() => setShowSendConfirm(true)}>
                Gửi cho Cán bộ Kỹ thuật
              </button>
            </div>
          )}
        </div>

        {/* Right Column: History */}
        <div className={styles.sidePanel}>
          <h3>Lịch sử chẩn đoán</h3>
          {history.map(h => (
            <div key={h.id} className={styles.historyCard}>
              <div className={styles.historyHeader}>
                <span className={styles.historyDate}>{h.date}</span>
                <Pill tone={h.status === 'SENT_TO_OFFICER' ? 'amber' : h.status === 'RESOLVED' ? 'green' : 'neutral'}>
                  {h.status === 'SENT_TO_OFFICER' ? 'Chờ CBKT xem' : h.status === 'RESOLVED' ? 'Đã xử lý' : 'Nháp'}
                </Pill>
              </div>
              <div className={styles.historyBody}>
                <span>{h.image}</span>
                <span className={styles.historyDisease}>{h.result[0]?.disease} ({h.result[0]?.confidence}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showSendConfirm && (
        <div className={styles.overlay} onClick={() => setShowSendConfirm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Xác nhận gửi</h2>
            <p style={{ marginBottom: '1.5rem', color: 'var(--color-text-muted)' }}>
              Kết quả chẩn đoán và hình ảnh sẽ được gửi đến Cán bộ Kỹ thuật HTX để phân tích chuyên sâu. Bạn có chắc chắn muốn gửi?
            </p>
            <div className={styles.formActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowSendConfirm(false)}>Hủy</button>
              <button type="button" className={styles.submitBtn} onClick={handleSendToOfficer}>
                Xác nhận gửi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
