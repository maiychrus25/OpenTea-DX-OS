// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Pill } from '@/components/ui'
import { WifiOff, RefreshCw, AlertTriangle, BookOpen, ImageIcon, Sparkles, Stethoscope } from 'lucide-react'
import kit from '@/components/features/farmer-web/kit.module.css'
import styles from '../diagnosis.module.css'
import { getDiagnosisHistory } from '../actions'
import { DiagnosisHistoryItem } from '@/domain/disease/ports/disease-report.port'
import { useOfflineSync } from '@/lib/hooks/useOfflineSync'
import { displayDiseaseName } from '@/domain/disease/display-disease-name'
import { ReportPhoto } from '@/components/features/disease/ReportPhoto'
import { diseaseStatusLabel } from '@/domain/disease/disease-status-label'

interface DiagnosisClientProps {
  initialParcels: { id: string; parcel_code: string; name: string }[]
  initialHistory: DiagnosisHistoryItem[]
}

export function DiagnosisClient({ initialParcels, initialHistory }: DiagnosisClientProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedParcelId, setSelectedParcelId] = useState<string>(initialParcels[0]?.id || '')
  
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<{ disease: string; confidence: number; uncertain: boolean } | null>(null)
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

  // A local preview of the chosen photo, released when it changes.
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedFile || typeof URL.createObjectURL !== 'function') { setPreview(null); return }
    const url = URL.createObjectURL(selectedFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedFile])

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
        uncertain: json.data.uncertain === true,
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

  const percent = result ? result.confidence * 100 : 0
  const unsure = percent < 70

  return (
    <div className={kit.page}>
      <div className={kit.hd}>
        <span className={kit.hico}><Stethoscope size={28} aria-hidden="true" /></span>
        <div className={kit.hdText}>
          <h1 className={kit.h1}>Chẩn đoán bệnh tự động</h1>
          <p className={kit.sub}>Tải ảnh lá bệnh để AI nhận diện. Kết quả được lưu và báo cho cán bộ kỹ thuật.</p>
        </div>
      </div>

      {!isOnline && (
        <div className={styles.offlineBanner}>
          <WifiOff size={16} aria-hidden="true" />
          Bạn đang ngoại tuyến. Hình ảnh sẽ được lưu vào máy và tự động tải lên khi có mạng (Đang chờ: {queueCount}).
        </div>
      )}
      {isOnline && queueCount > 0 && (
        <div className={styles.syncBanner}>
          <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
          Đang đồng bộ {queueCount} hình ảnh từ bộ nhớ tạm... {isSyncing ? '(Đang xử lý)' : ''}
        </div>
      )}

      <div className={kit.cols}>
        <div className={`${kit.stack} ${styles.mainColumn}`}>
          <section className={kit.pn} aria-label="Ảnh lá chè">
            <div className={kit.ph}><h2>Ảnh lá chè</h2></div>
            <div className={styles.panelBody}>
              <label className={kit.fl}>
                Chọn thửa đất
                <select className={`${kit.inp} ${styles.select}`} value={selectedParcelId} onChange={(e) => setSelectedParcelId(e.target.value)}>
                  {initialParcels.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.parcel_code})</option>
                  ))}
                </select>
              </label>

              <input type="file" id="fileInput" accept="image/jpeg, image/png" className={styles.fileInput} onChange={handleFileSelect} />
              <label htmlFor="fileInput" className={styles.preview}>
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Ảnh lá chè đã chọn" />
                ) : (
                  <span>
                    <ImageIcon size={28} aria-hidden="true" />
                    {selectedFile ? `Đã chọn: ${selectedFile.name}` : 'Nhấn để chọn ảnh lá chè'}
                  </span>
                )}
              </label>

              {errorMsg && <div className={styles.errorBox}>{errorMsg}</div>}
              {successMsg && <div className={styles.successBox}>{successMsg}</div>}

              <div className={styles.actions}>
                <label htmlFor="fileInput" className={`${kit.btn2} ${styles.pick}`}>
                  <ImageIcon size={16} aria-hidden="true" />
                  {selectedFile ? 'Chọn ảnh khác' : 'Chọn ảnh'}
                </label>
                {result ? (
                  <button type="button" className={`${kit.btn} ${styles.go}`} onClick={resetForm}>Chẩn đoán hình ảnh khác</button>
                ) : (
                  <button type="button" className={`${kit.btn} ${styles.go}`} onClick={handleAnalyze} disabled={!selectedFile || isAnalyzing}>
                    {isAnalyzing ? 'Đang phân tích và gửi cho CBKT...' : 'Bắt đầu chẩn đoán'}
                  </button>
                )}
              </div>
              <span className={styles.hint}>Ảnh JPEG hoặc PNG, tối đa 5 MB. Chụp một lá rõ nét, đủ sáng.</span>
            </div>
          </section>

          {result && (
            <section className={kit.pn} aria-label="Kết quả AI gợi ý">
              <div className={kit.ph}><h2>Kết quả AI gợi ý</h2><span className={`${kit.tag} ${kit.amber}`}>Chưa phải chẩn đoán cuối cùng</span></div>
              <div className={styles.panelBody}>
                <div className={styles.verdict}>
                  <strong>{result.disease}</strong>
                  {!result.uncertain && <span className={`${kit.tag} ${unsure ? kit.amber : kit.ok}`}>{percent.toFixed(1)}%</span>}
                </div>
                {!result.uncertain && (
                  <progress className={`${styles.bar} ${unsure ? styles.barLow : ''}`} max={100} value={percent} aria-label="Độ tin cậy" />
                )}
                {unsure && (
                  <div className={kit.warn}>
                    <AlertTriangle size={20} aria-hidden="true" />
                    <span><strong>Độ tự tin thấp:</strong> ảnh có thể mờ hoặc chưa rõ triệu chứng. Cán bộ kỹ thuật đã nhận được thông báo và sẽ kiểm tra thêm.</span>
                  </div>
                )}
                <p className={styles.successBox} role="status">Đã gửi cán bộ kỹ thuật xem</p>
                <p className={styles.aiNote}>* AI không đưa ra khuyến nghị điều trị. Hãy tham khảo ý kiến chuyên gia. CBKT đã nhận được kết quả này.</p>
                <div className={styles.actions}>
                  <Link href="/farmer/ai" className={kit.btn2}><Sparkles size={16} aria-hidden="true" />Hỏi AI cách xử lý</Link>
                  <Link href="/farmer/handbook" className={kit.btn2}><BookOpen size={16} aria-hidden="true" />Xem cẩm nang</Link>
                </div>
              </div>
            </section>
          )}
        </div>

        <section className={`${kit.pn} ${styles.historyColumn}`} aria-label="Lịch sử chẩn đoán">
          <div className={kit.ph}><h2>Lịch sử chẩn đoán</h2></div>
          {history.length === 0 ? (
            <p className={styles.emptyHistory}>Chưa có lịch sử chẩn đoán.</p>
          ) : (
            <ul className={kit.list}>
              {history.map(h => (
                <li key={h.id} className={styles.historyCard}>
                  <span className={styles.thumb}>
                    {h.photo_url ? <ReportPhoto src={h.photo_url} alt="Disease" className={styles.historyImage} /> : <ImageIcon size={18} aria-label="Ảnh không khả dụng" />}
                  </span>
                  <span className={kit.grow}>
                    <strong>{displayDiseaseName(h)} ({(h.ai_confidence * 100).toFixed(1)}%)</strong>
                    <span className={styles.pastMeta}>{h.parcel_code} · {new Date(h.detection_date).toLocaleDateString('vi-VN')}</span>
                    {h.treatment_recommendation && (
                      <span className={styles.advice}><strong>Hướng dẫn CBKT:</strong> {h.treatment_recommendation}</span>
                    )}
                  </span>
                  <Pill tone={diseaseStatusLabel(h.status).tone}>{diseaseStatusLabel(h.status).label}</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
