// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { FileText, Trash2, RefreshCcw, Eye, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui/Modal/Modal'
import styles from './CertificateManager.module.css'

export interface Certificate {
  id: string
  name: string
  type: string
  issueDate: string
  expiryDate: string
  fileUrl: string
  isExpired: boolean
  selected?: boolean
}

interface CertificateManagerProps {
  mode: 'manage' | 'select'
  initialCertificates?: Certificate[]
  onSelect?: (selectedIds: string[]) => void
}

const MOCK_CERTIFICATES: Certificate[] = [
  {
    id: 'c1',
    name: 'Chứng nhận VietGAP',
    type: 'VietGAP',
    issueDate: '2025-01-15',
    expiryDate: '2026-01-15', // Expired
    fileUrl: '#',
    isExpired: true
  },
  {
    id: 'c2',
    name: 'Chứng nhận Hữu cơ (Organic)',
    type: 'Organic',
    issueDate: '2026-05-10',
    expiryDate: '2027-05-10',
    fileUrl: '#',
    isExpired: false
  }
]

export function CertificateManager({ mode, initialCertificates = MOCK_CERTIFICATES, onSelect }: CertificateManagerProps) {
  const [certificates, setCertificates] = useState<Certificate[]>(initialCertificates.map(c => ({...c, selected: false})))
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [certName, setCertName] = useState('')
  const [certType, setCertType] = useState('VietGAP')
  const [expiryDate, setExpiryDate] = useState('')
  const [previewCert, setPreviewCert] = useState<Certificate | null>(null)

  const handlePreview = (cert: Certificate) => {
    if (cert.fileUrl && cert.fileUrl !== '#') {
      // Có URL thực → hiển thị inline PDF modal
      setPreviewCert(cert)
    } else {
      // fileUrl = '#' placeholder — file chưa được tải lên MinIO
      toast.error('File chứng nhận chưa được tải lên. Hãy dùng nút Cập nhật để đính kèm file.')
    }
  }

  const handleToggleSelect = (id: string) => {
    if (mode !== 'select') return
    const updated = certificates.map(c => c.id === id ? { ...c, selected: !c.selected } : c)
    setCertificates(updated)
    onSelect?.(updated.filter(c => c.selected).map(c => c.id))
  }

  const handleDelete = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa chứng nhận này?')) {
      setCertificates(certificates.filter(c => c.id !== id))
    }
  }

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return

    const newCert: Certificate = {
      id: Date.now().toString(),
      name: certName || uploadFile.name,
      type: certType,
      issueDate: new Date().toISOString().split('T')[0],
      expiryDate: expiryDate,
      fileUrl: '#',
      isExpired: new Date(expiryDate) < new Date(),
      selected: false
    }

    setCertificates([...certificates, newCert])
    setIsUploadModalOpen(false)
    setUploadFile(null)
    setCertName('')
    setExpiryDate('')
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Chứng nhận & Kiểm định</h3>
          <p className={styles.subtitle}>
            {mode === 'manage' ? 'Quản lý các loại giấy chứng nhận chất lượng của HTX.' : 'Chọn các chứng nhận để đính kèm vào lô hàng này.'}
          </p>
        </div>
        {mode === 'manage' && (
          <Button onClick={() => setIsUploadModalOpen(true)} className="flex items-center gap-2">
            <Plus size={16} /> Thêm chứng nhận
          </Button>
        )}
      </div>

      <div className={styles.grid}>
        {certificates.map(cert => (
          <div 
            key={cert.id} 
            className={`${styles.card} ${cert.selected ? styles.selected : ''} ${cert.isExpired ? styles.expiredCard : ''}`}
            onClick={() => handleToggleSelect(cert.id)}
          >
            {mode === 'select' && (
              <div className={styles.checkboxWrapper}>
                <input 
                  type="checkbox" 
                  checked={cert.selected} 
                  readOnly 
                  className={styles.checkbox}
                />
              </div>
            )}
            
            <div className={styles.cardIcon}>
              <FileText size={24} className={cert.isExpired ? 'text-red-500' : 'text-primary'} />
            </div>
            
            <div className={styles.cardContent}>
              <h4 className={styles.certName}>{cert.name}</h4>
              <span className={styles.certType}>{cert.type}</span>
              
              <div className={styles.certMeta}>
                <span className={cert.isExpired ? styles.expiredText : ''}>
                  Hết hạn: {new Date(cert.expiryDate).toLocaleDateString('vi-VN')}
                </span>
                {cert.isExpired && <span className={styles.expiredBadge}>Đã hết hạn</span>}
              </div>
            </div>

            {mode === 'manage' && (
              <div className={styles.cardActions}>
                <button type="button" className={styles.actionBtn} title="Xem PDF" onClick={(e) => { e.stopPropagation(); handlePreview(cert) }}>
                  <Eye size={16} />
                </button>
                <button type="button" className={styles.actionBtn} title="Cập nhật mới" onClick={(e) => { e.stopPropagation(); setIsUploadModalOpen(true) }}>
                  <RefreshCcw size={16} />
                </button>
                <button type="button" className={`${styles.actionBtn} ${styles.danger}`} title="Xóa" onClick={(e) => { e.stopPropagation(); handleDelete(cert.id) }}>
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
        
        {certificates.length === 0 && (
          <div className={styles.empty}>Chưa có chứng nhận nào.</div>
        )}
      </div>

      <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} title="Thêm chứng nhận mới">
        <form onSubmit={handleUpload}>
          <div className={styles.formGroup}>
            <label>Tên chứng nhận</label>
            <input type="text" value={certName} onChange={e => setCertName(e.target.value)} required placeholder="VD: Chứng nhận VietGAP 2026" />
          </div>
          <div className={styles.formGroup}>
            <label>Loại</label>
            <select value={certType} onChange={e => setCertType(e.target.value)}>
              <option value="VietGAP">VietGAP</option>
              <option value="GlobalGAP">GlobalGAP</option>
              <option value="Organic">Hữu cơ (Organic)</option>
              <option value="ISO">ISO 9001/22000</option>
              <option value="Other">Khác</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Ngày hết hạn</label>
            <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <label>File scan (PDF)</label>
            <input type="file" accept=".pdf,.jpg,.png" onChange={e => setUploadFile(e.target.files?.[0] || null)} required />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setIsUploadModalOpen(false)} type="button">Hủy</Button>
            <Button type="submit" disabled={!uploadFile}>Tải lên</Button>
          </div>
        </form>
      </Modal>

      {/* PDF Preview Modal */}
      {previewCert && (
        <Modal
          isOpen={!!previewCert}
          onClose={() => setPreviewCert(null)}
          title={`Xem chứng nhận: ${previewCert.name}`}
        >
          <div className={styles.pdfPreviewContainer}>
            <iframe
              src={previewCert.fileUrl}
              title={previewCert.name}
              className={styles.pdfIframe}
              loading="lazy"
            >
              <p>
                Trình duyệt không hỗ trợ xem PDF trực tiếp.{' '}
                <a href={previewCert.fileUrl} target="_blank" rel="noopener noreferrer">
                  Tải xuống file
                </a>
              </p>
            </iframe>
          </div>
        </Modal>
      )}
    </div>
  )
}
