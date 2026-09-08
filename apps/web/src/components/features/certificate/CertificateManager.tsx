// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useRef, useEffect } from 'react'
import { FileText, Trash2, RefreshCcw, Eye, Plus, Download } from 'lucide-react'
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
    fileUrl: '/sample-certificate.pdf',
    isExpired: true
  },
  {
    id: 'c2',
    name: 'Chứng nhận Hữu cơ (Organic)',
    type: 'Organic',
    issueDate: '2026-05-10',
    expiryDate: '2027-05-10',
    fileUrl: '/sample-certificate.pdf',
    isExpired: false
  }
]

const isDateExpired = (dateString: string): boolean => {
  if (!dateString) return false
  const todayStr = new Date().toISOString().split('T')[0]
  return dateString < todayStr
}

const isImageFile = (url: string, name?: string): boolean => {
  if (!url) return false
  const lowerUrl = url.toLowerCase()
  const lowerName = (name || '').toLowerCase()
  return (
    lowerUrl.endsWith('.jpg') ||
    lowerUrl.endsWith('.jpeg') ||
    lowerUrl.endsWith('.png') ||
    lowerUrl.startsWith('data:image/') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png')
  )
}

export function CertificateManager({ mode, initialCertificates = MOCK_CERTIFICATES, onSelect }: CertificateManagerProps) {
  const [certificates, setCertificates] = useState<Certificate[]>(
    initialCertificates.map(c => ({
      ...c,
      selected: false,
      isExpired: isDateExpired(c.expiryDate)
    }))
  )
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCert, setEditingCert] = useState<Certificate | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [certName, setCertName] = useState('')
  const [certType, setCertType] = useState('VietGAP')
  const [expiryDate, setExpiryDate] = useState('')
  const [previewCert, setPreviewCert] = useState<Certificate | null>(null)

  // Track created object URLs to revoke them and prevent memory leaks
  const createdUrlsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const urls = createdUrlsRef.current
    return () => {
      urls.forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [])

  const handleOpenAddModal = () => {
    setEditingCert(null)
    setCertName('')
    setCertType('VietGAP')
    setExpiryDate('')
    setUploadFile(null)
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (cert: Certificate) => {
    setEditingCert(cert)
    setCertName(cert.name)
    setCertType(cert.type)
    setExpiryDate(cert.expiryDate)
    setUploadFile(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingCert(null)
    setUploadFile(null)
    setCertName('')
    setExpiryDate('')
  }

  const handlePreview = (cert: Certificate) => {
    if (cert.fileUrl && cert.fileUrl !== '#') {
      setPreviewCert(cert)
    } else {
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
    const target = certificates.find(c => c.id === id)
    if (confirm('Bạn có chắc chắn muốn xóa chứng nhận này?')) {
      if (target?.fileUrl && target.fileUrl.startsWith('blob:')) {
        URL.revokeObjectURL(target.fileUrl)
        createdUrlsRef.current.delete(target.fileUrl)
      }
      setCertificates(prev => prev.filter(c => c.id !== id))
      toast.success('Đã xóa chứng nhận thành công')
    }
  }

  const handleSaveCertificate = (e: React.FormEvent) => {
    e.preventDefault()

    // 10MB limit enforcement per rules-and-limits.md §2.1
    if (uploadFile && uploadFile.size > 10 * 1024 * 1024) {
      toast.error('Kích thước file không được vượt quá 10MB.')
      return
    }

    if (editingCert) {
      // --- UPDATE MODE ---
      let nextFileUrl = editingCert.fileUrl

      if (uploadFile) {
        if (nextFileUrl.startsWith('blob:')) {
          URL.revokeObjectURL(nextFileUrl)
          createdUrlsRef.current.delete(nextFileUrl)
        }
        nextFileUrl = URL.createObjectURL(uploadFile)
        createdUrlsRef.current.add(nextFileUrl)
      }

      const updated: Certificate = {
        ...editingCert,
        name: certName || (uploadFile ? uploadFile.name : editingCert.name),
        type: certType,
        expiryDate,
        fileUrl: nextFileUrl,
        isExpired: isDateExpired(expiryDate)
      }

      setCertificates(prev => prev.map(c => c.id === editingCert.id ? updated : c))
      toast.success('Cập nhật chứng nhận thành công!')
    } else {
      // --- CREATE MODE ---
      if (!uploadFile) {
        toast.error('Vui lòng chọn file scan chứng nhận.')
        return
      }

      const newUrl = URL.createObjectURL(uploadFile)
      createdUrlsRef.current.add(newUrl)

      const newCert: Certificate = {
        id: Date.now().toString(),
        name: certName || uploadFile.name,
        type: certType,
        issueDate: new Date().toISOString().split('T')[0],
        expiryDate,
        fileUrl: newUrl,
        isExpired: isDateExpired(expiryDate),
        selected: false
      }

      setCertificates(prev => [...prev, newCert])
      toast.success('Thêm chứng nhận mới thành công!')
    }

    handleCloseModal()
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
          <Button 
            type="button" 
            onClick={(e) => {
              e.stopPropagation()
              handleOpenAddModal()
            }} 
            className="flex items-center gap-2"
          >
            <Plus size={16} aria-hidden="true" /> Thêm chứng nhận
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
                  aria-label={`Chọn chứng nhận ${cert.name}`}
                />
              </div>
            )}
            
            <div className={styles.cardIcon}>
              <FileText size={24} className={cert.isExpired ? 'text-red-500' : 'text-primary'} aria-hidden="true" />
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
                <button 
                  type="button" 
                  className={styles.actionBtn} 
                  title="Xem tài liệu" 
                  aria-label="Xem tài liệu" 
                  onClick={(e) => { e.stopPropagation(); handlePreview(cert) }}
                >
                  <Eye size={16} aria-hidden="true" />
                </button>
                <button 
                  type="button" 
                  className={styles.actionBtn} 
                  title="Cập nhật chứng nhận" 
                  aria-label="Cập nhật chứng nhận" 
                  onClick={(e) => { e.stopPropagation(); handleOpenEditModal(cert) }}
                >
                  <RefreshCcw size={16} aria-hidden="true" />
                </button>
                <button 
                  type="button" 
                  className={`${styles.actionBtn} ${styles.danger}`} 
                  title="Xóa chứng nhận" 
                  aria-label="Xóa chứng nhận" 
                  onClick={(e) => { e.stopPropagation(); handleDelete(cert.id) }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        ))}
        
        {certificates.length === 0 && (
          <div className={styles.empty}>Chưa có chứng nhận nào.</div>
        )}
      </div>

      {/* Upload / Edit Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
        title={editingCert ? `Cập nhật chứng nhận: ${editingCert.name}` : "Thêm chứng nhận mới"}
      >
        <form onSubmit={handleSaveCertificate}>
          <div className={styles.formGroup}>
            <label htmlFor="certNameInput">Tên chứng nhận</label>
            <input 
              id="certNameInput"
              type="text" 
              value={certName} 
              onChange={e => setCertName(e.target.value)} 
              required 
              placeholder="VD: Chứng nhận VietGAP 2026" 
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="certTypeSelect">Loại</label>
            <select 
              id="certTypeSelect"
              value={certType} 
              onChange={e => setCertType(e.target.value)}
            >
              <option value="VietGAP">VietGAP</option>
              <option value="GlobalGAP">GlobalGAP</option>
              <option value="Organic">Hữu cơ (Organic)</option>
              <option value="ISO">ISO 9001/22000</option>
              <option value="Other">Khác</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="expiryDateInput">Ngày hết hạn</label>
            <input 
              id="expiryDateInput"
              type="date" 
              value={expiryDate} 
              onChange={e => setExpiryDate(e.target.value)} 
              required 
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="certFileInput">File scan (PDF, JPG, PNG)</label>
            <input 
              id="certFileInput"
              type="file" 
              accept=".pdf,.jpg,.jpeg,.png" 
              onChange={e => setUploadFile(e.target.files?.[0] || null)} 
              required={!editingCert || (!editingCert.fileUrl || editingCert.fileUrl === '#')} 
            />
            {editingCert && editingCert.fileUrl && editingCert.fileUrl !== '#' && (
              <span className={styles.fileHint}>
                Đang dùng file hiện tại. Chọn file mới nếu bạn muốn thay thế.
              </span>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={handleCloseModal} type="button">
              Hủy
            </Button>
            <Button type="submit" disabled={!editingCert && !uploadFile}>
              {editingCert ? 'Lưu thay đổi' : 'Tải lên'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Document Preview Modal */}
      {previewCert && (
        <Modal
          isOpen={!!previewCert}
          onClose={() => setPreviewCert(null)}
          title={`Xem chứng nhận: ${previewCert.name}`}
        >
          {isImageFile(previewCert.fileUrl, previewCert.name) ? (
            <div className={styles.imagePreviewContainer}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL preview requires native img element */}
              <img
                src={previewCert.fileUrl}
                alt={previewCert.name}
                className={styles.imagePreview}
              />
            </div>
          ) : (
            <div className={styles.pdfPreviewContainer}>
              <iframe
                src={previewCert.fileUrl}
                title={previewCert.name}
                className={styles.pdfIframe}
                loading="lazy"
              >
                <div className="p-4 text-center">
                  <p>Trình duyệt không hỗ trợ xem PDF trực tiếp trong trang.</p>
                  <a 
                    href={previewCert.fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-1 text-primary underline mt-2"
                  >
                    <Download size={16} aria-hidden="true" /> Mở hoặc tải xuống file
                  </a>
                </div>
              </iframe>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
