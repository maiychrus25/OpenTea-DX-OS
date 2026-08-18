// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect } from 'react'
import { Folder, FileText, Download, Eye, Upload, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui/Modal/Modal'
import styles from './DocumentView.module.css'

interface DocumentItem {
  name: string
  size: number
  uploadDate: Date
  key: string
  isDir: boolean
}

const CATEGORIES = [
  { id: 'para/Projects/', name: 'Projects', description: 'Các dự án ngắn hạn' },
  { id: 'para/Areas/', name: 'Areas', description: 'Khu vực quản lý dài hạn' },
  { id: 'para/Resources/', name: 'Resources', description: 'Tài liệu tham khảo chung' },
  { id: 'para/Archives/', name: 'Archives', description: 'Lưu trữ cũ' }
]

export function DocumentView() {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id)
  const [currentPath, setCurrentPath] = useState(CATEGORIES[0].id)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  
  // Upload states
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    fetchDocuments(currentPath)
  }, [currentPath])

  const fetchDocuments = async (path: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/documents?path=${encodeURIComponent(path)}`)
      const json = await res.json()
      if (json.data && json.data.documents) {
        // Fix string date to Date object
        setDocuments(json.data.documents.map((d: Omit<DocumentItem, 'uploadDate'> & { uploadDate: string }) => ({
          ...d,
          uploadDate: new Date(d.uploadDate)
        })))
      }
    } catch (error) {
      console.error('Failed to fetch documents', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCategorySelect = (categoryId: string) => {
    setActiveCategory(categoryId)
    setCurrentPath(categoryId)
  }

  const handleFolderClick = (key: string) => {
    setCurrentPath(key)
  }

  const handleBreadcrumbClick = () => {
    setCurrentPath(activeCategory)
  }

  const handleAction = async (key: string, download: boolean) => {
    try {
      const res = await fetch(`/api/documents/url?key=${encodeURIComponent(key)}&download=${download}`)
      const json = await res.json()
      if (json.data?.url) {
        if (download) {
          const a = document.createElement('a')
          a.href = json.data.url
          a.download = ''
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        } else {
          window.open(json.data.url, '_blank')
        }
      }
    } catch (error) {
      console.error('Action failed', error)
      alert('Có lỗi xảy ra khi tạo link tải/xem')
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return

    setIsUploading(true)
    try {
      // 1. Get presigned URL
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: uploadFile.name,
          pathPrefix: currentPath
        })
      })
      const json = await res.json()
      
      if (!res.ok) throw new Error(json.error || 'Failed to get upload URL')
      
      const { uploadUrl } = json.data

      // 2. Upload directly to MinIO
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: uploadFile,
        headers: {
          'Content-Type': uploadFile.type || 'application/octet-stream'
        }
      })

      if (!uploadRes.ok) throw new Error('Upload failed')

      // Success
      setIsUploadModalOpen(false)
      setUploadFile(null)
      fetchDocuments(currentPath)
      
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Lỗi upload: ${message}`)
    } finally {
      setIsUploading(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Kho tài liệu P.A.R.A</h1>
        <Button onClick={() => setIsUploadModalOpen(true)} className="flex items-center gap-2">
          <Upload size={18} />
          Tải tài liệu lên
        </Button>
      </div>

      <div className={styles.content}>
        <div className={styles.sidebar}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`${styles.categoryBtn} ${activeCategory === cat.id ? styles.active : ''}`}
              onClick={() => handleCategorySelect(cat.id)}
            >
              <Folder size={18} />
              {cat.name}
            </button>
          ))}
        </div>

        <div className={styles.mainPanel}>
          <div className={styles.panelHeader}>
            <button 
              onClick={handleBreadcrumbClick}
              className="text-primary font-medium hover:underline cursor-pointer"
            >
              {CATEGORIES.find(c => c.id === activeCategory)?.name}
            </button>
            {currentPath !== activeCategory && (
              <>
                <ChevronRight size={16} className="text-gray-400" />
                <span className="text-gray-600 font-medium">
                  {currentPath.replace(activeCategory, '').replace(/\/$/, '')}
                </span>
              </>
            )}
          </div>

          <div className={styles.fileList}>
            {isLoading ? (
              <div className={styles.emptyState}>Đang tải...</div>
            ) : documents.length === 0 ? (
              <div className={styles.emptyState}>Thư mục trống</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Kích thước</th>
                    <th>Ngày tải lên</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc, i) => (
                    <tr key={i} className={doc.isDir ? styles.isDir : ''}>
                      <td>
                        {doc.isDir ? (
                          <div 
                            className={`${styles.fileNameCell} cursor-pointer hover:text-primary`}
                            onClick={() => handleFolderClick(doc.key)}
                          >
                            <Folder className={styles.icon} />
                            {doc.name}
                          </div>
                        ) : (
                          <div className={styles.fileNameCell}>
                            <FileText className={styles.icon} />
                            {doc.name}
                          </div>
                        )}
                      </td>
                      <td>{formatSize(doc.size)}</td>
                      <td>{doc.isDir ? '-' : doc.uploadDate.toLocaleString('vi-VN')}</td>
                      <td>
                        {!doc.isDir && (
                          <div className={styles.actions}>
                            <Button 
                              variant="text" 
                              onClick={() => handleAction(doc.key, false)}
                              title="Xem"
                            >
                              <Eye size={18} />
                            </Button>
                            <Button 
                              variant="text" 
                              onClick={() => handleAction(doc.key, true)}
                              title="Tải về"
                            >
                              <Download size={18} />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => !isUploading && setIsUploadModalOpen(false)}
        title="Tải tài liệu lên"
      >
        <form onSubmit={handleUpload}>
          <div className={styles.formGroup}>
            <label>Thư mục đích</label>
            <input 
              type="text" 
              value={currentPath} 
              disabled 
              className="bg-gray-100"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Chọn file</label>
            <input 
              type="file" 
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
              required
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button 
              variant="secondary" 
              onClick={() => setIsUploadModalOpen(false)}
              disabled={isUploading}
              type="button"
            >
              Hủy
            </Button>
            <Button type="submit" disabled={!uploadFile || isUploading}>
              {isUploading ? 'Đang tải...' : 'Tải lên'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
