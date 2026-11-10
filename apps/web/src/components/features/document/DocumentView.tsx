// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Folder, FileText, Download, Eye, Upload, ChevronRight, Search, Plus, Tag, Shield, FolderInput } from 'lucide-react'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui/Modal/Modal'
import styles from './DocumentView.module.css'
import { DocumentItem } from './mock-data'
import { MOCK_DOCUMENTS } from './mock-data'
import { documentRoot, MARKET_REPORTS_ROOT } from '@/domain/document/document-namespace'

const CATEGORIES = [
  { id: 'Projects/', name: 'Projects', description: 'Các dự án ngắn hạn' },
  { id: 'Areas/', name: 'Areas', description: 'Khu vực quản lý dài hạn' },
  { id: 'Resources/', name: 'Resources', description: 'Tài liệu tham khảo chung' },
  { id: 'Archives/', name: 'Archives', description: 'Lưu trữ cũ' }
]

export function DocumentView({ htxCode }: { htxCode: string }) {
  const root = documentRoot(htxCode)
  const categories = [
    ...CATEGORIES.map(cat => ({ ...cat, id: `${root}${cat.id}` })),
    { id: MARKET_REPORTS_ROOT, name: 'Báo cáo thị trường', description: 'Báo cáo dùng chung, chỉ đọc' },
  ]
  const [activeCategory, setActiveCategory] = useState(categories[0].id)
  const isReadOnly = activeCategory === MARKET_REPORTS_ROOT
  const [currentPath, setCurrentPath] = useState(categories[0].id)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false)
  
  // Upload states
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  
  // New folder state
  const [newFolderName, setNewFolderName] = useState('')


  const fetchDocuments = useCallback(async (path: string) => {
    // The mock tree has no HTX level.
    const mockPath = path.replace(root, 'para/')
    setIsLoading(true)
    try {
      const res = await fetch(`/api/documents?path=${encodeURIComponent(path)}`)

      if (res.ok) {
        const json = await res.json()
        const items: DocumentItem[] = (json.data?.documents || []).map((item: any) => ({
          id: item.key || item.name,
          name: item.name,
          size: item.size || 0,
          uploadDate: item.uploadDate ? new Date(item.uploadDate) : new Date(),
          key: item.key,
          isDir: item.isDir || item.key?.endsWith('/') || false,
          tags: [],
          privacy: 'N\u1ed9i b\u1ed9 HTX' as const,
        }))
        
        let filtered = items
        if (searchQuery) {
          filtered = items.filter(doc => doc.name.toLowerCase().includes(searchQuery.toLowerCase()))
        }
        setDocuments(filtered)
      } else {
        // API failed, fallback to mock for categories that have mock data
        const filtered = MOCK_DOCUMENTS.filter(doc => doc.key.startsWith(mockPath) && doc.key !== mockPath)
          .filter(doc => {
            const remainingPath = doc.key.replace(mockPath, '')
            if (doc.isDir) return remainingPath.split('/').length === 2
            return !remainingPath.includes('/')
          })
        setDocuments(filtered)
      }
    } catch {
      // On error, fallback to mock data
      const filtered = MOCK_DOCUMENTS.filter(doc => doc.key.startsWith(mockPath) && doc.key !== mockPath)
        .filter(doc => {
          const remainingPath = doc.key.replace(mockPath, '')
          if (doc.isDir) return remainingPath.split('/').length === 2
          return !remainingPath.includes('/')
        })
      setDocuments(filtered)
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, root])

  // Fetch documents on load, when path changes, or when search query changes
  useEffect(() => {
    fetchDocuments(currentPath)
  }, [currentPath, fetchDocuments])

  const handleCategorySelect = (categoryId: string) => {
    setActiveCategory(categoryId)
    setCurrentPath(categoryId)
    setSearchQuery('')
  }

  const handleFolderClick = (key: string) => {
    setCurrentPath(key)
    setSearchQuery('')
  }

  const handleBreadcrumbClick = () => {
    setCurrentPath(activeCategory)
    setSearchQuery('')
  }

  const handleAction = async (key: string, download: boolean) => {
    try {
      const res = await fetch(`/api/documents/url?key=${encodeURIComponent(key)}&download=${download}`)
      if (res.ok) {
        const json = await res.json()
        const url = json.data?.url
        if (url) {
          window.open(url, '_blank')
        }
      } else {
        alert('Không thể truy cập tài liệu. MinIO có thể chưa khởi động.')
      }
    } catch {
      alert('Lỗi kết nối. Vui lòng thử lại.')
    }
  }
  
  const handleMoveAction = (key: string) => {
    alert(`Tính năng di chuyển tài liệu đang phát triển: ${key}`)
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return

    setIsUploading(true)
    setUploadProgress(0)
    setUploadError(null)
    
    try {
      // Step 1: Get pre-signed upload URL from API
      setUploadProgress(10)
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: uploadFile.name,
          pathPrefix: currentPath,
        }),
      })
      
      if (!res.ok) {
        throw new Error('Không thể tạo URL tải lên')
      }
      
      const json = await res.json()
      const uploadUrl = json.data?.url
      if (!uploadUrl) throw new Error('Không nhận được URL tải lên')
      
      // Step 2: Upload file directly to MinIO via pre-signed URL
      setUploadProgress(30)
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: uploadFile,
        headers: { 'Content-Type': uploadFile.type || 'application/octet-stream' },
      })
      
      if (!putRes.ok) throw new Error('Tải lên thất bại')
      
      setUploadProgress(100)
      setTimeout(() => {
        setIsUploadModalOpen(false)
        setUploadFile(null)
        setIsUploading(false)
        setUploadProgress(0)
        fetchDocuments(currentPath)
      }, 500)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Lỗi khi tải lên. Vui lòng thử lại.')
      setIsUploading(false)
    }
  }
  
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) return
    
    try {
      // Create a folder by uploading a placeholder object with trailing slash
      const folderKey = `${currentPath}${newFolderName.trim()}/`
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: '.folder',
          pathPrefix: folderKey,
        }),
      })
      
      if (res.ok) {
        const json = await res.json()
        const uploadUrl = json.data?.url
        if (uploadUrl) {
          await fetch(uploadUrl, {
            method: 'PUT',
            body: '',
            headers: { 'Content-Type': 'application/x-directory' },
          })
        }
      }
    } catch {
      // Folder creation failed silently, still refresh
    }
    
    setNewFolderName('')
    setIsNewFolderModalOpen(false)
    fetchDocuments(currentPath)
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
        {!isReadOnly && (
          <div className="flex gap-2">
            <Button onClick={() => setIsNewFolderModalOpen(true)} variant="secondary" className="flex items-center gap-2">
              <Plus size={18} />
              Thư mục mới
            </Button>
            <Button onClick={() => {
               setUploadError(null)
               setUploadProgress(0)
               setIsUploadModalOpen(true)
            }} className="flex items-center gap-2">
              <Upload size={18} />
              Tải tài liệu lên
            </Button>
          </div>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.sidebar}>
          {categories.map(cat => (
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
            <div className="flex items-center gap-2 flex-1">
              <button 
                onClick={handleBreadcrumbClick}
                className="text-primary font-medium hover:underline cursor-pointer"
              >
                {categories.find(c => c.id === activeCategory)?.name}
              </button>
              {currentPath !== activeCategory && (
                <>
                  <ChevronRight size={16} className="text-ink-tertiary" />
                  <span className="text-ink-secondary font-medium">
                    {currentPath.replace(activeCategory, '').replace(/\/$/, '')}
                  </span>
                </>
              )}
            </div>
            
            <div className={styles.searchBox}>
              <Search size={16} className="text-ink-tertiary" />
              <input 
                type="text" 
                placeholder="Tìm tài liệu, thư mục..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.fileList}>
            {isLoading ? (
              <div className={styles.emptyState}>Đang tải...</div>
            ) : documents.length === 0 ? (
              <div className={styles.emptyState}>Không có tài liệu nào</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Nhãn & Phân quyền</th>
                    <th>Kích thước</th>
                    <th>Ngày cập nhật</th>
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
                      <td>
                        <div className={styles.metaCell}>
                          <div className={styles.privacyBadge} data-privacy={doc.privacy}>
                            <Shield size={12} /> {doc.privacy}
                          </div>
                          {doc.tags.map(tag => (
                            <span key={tag} className={styles.tag}>
                              <Tag size={12} /> {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{formatSize(doc.size)}</td>
                      <td>{doc.isDir ? '-' : doc.uploadDate.toLocaleDateString('vi-VN')}</td>
                      <td>
                        <div className={styles.actions}>
                          {!doc.isDir && (
                            <>
                              <Button variant="text" onClick={() => handleAction(doc.key, false)} title="Xem">
                                <Eye size={18} />
                              </Button>
                              <Button variant="text" onClick={() => handleAction(doc.key, true)} title="Tải về">
                                <Download size={18} />
                              </Button>
                            </>
                          )}
                          {!isReadOnly && (
                            <Button variant="text" onClick={() => handleMoveAction(doc.key)} title="Di chuyển">
                              <FolderInput size={18} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => !isUploading && setIsUploadModalOpen(false)}
        title="Tải tài liệu lên"
      >
        <form onSubmit={handleUpload}>
          <div className={styles.formGroup}>
            <label>Thư mục đích</label>
            <input type="text" value={currentPath} disabled className="bg-muted" />
          </div>
          <div className={styles.formGroup}>
            <label>Chọn file</label>
            <input 
              type="file" 
              onChange={e => {
                setUploadFile(e.target.files?.[0] || null)
                setUploadError(null)
              }}
              required
              disabled={isUploading}
            />
          </div>
          
          {isUploading && (
            <div className={styles.progressContainer}>
              <div className="flex justify-between text-sm mb-1">
                <span>Đang tải lên...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className={styles.progressBarBg}>
                <div className={styles.progressBarFill} style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
          
          {uploadError && (
             <div className={styles.errorAlert}>
               {uploadError}
             </div>
          )}
          
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setIsUploadModalOpen(false)} disabled={isUploading} type="button">
              Hủy
            </Button>
            {uploadError ? (
              <Button type="submit" disabled={!uploadFile || isUploading}>
                Thử lại
              </Button>
            ) : (
              <Button type="submit" disabled={!uploadFile || isUploading}>
                {isUploading ? 'Đang tải...' : 'Tải lên'}
              </Button>
            )}
          </div>
        </form>
      </Modal>
      
      {/* New Folder Modal */}
      <Modal
        isOpen={isNewFolderModalOpen}
        onClose={() => setIsNewFolderModalOpen(false)}
        title="Tạo thư mục mới"
      >
        <form onSubmit={handleCreateFolder}>
          <div className={styles.formGroup}>
            <label>Tên thư mục</label>
            <input 
              type="text" 
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="VD: Tai lieu 2026"
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setIsNewFolderModalOpen(false)} type="button">
              Hủy
            </Button>
            <Button type="submit" disabled={!newFolderName.trim()}>
              Tạo mới
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
