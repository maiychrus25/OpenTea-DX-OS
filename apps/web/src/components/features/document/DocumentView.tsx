// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect } from 'react'
import { Folder, FileText, Download, Eye, Upload, ChevronRight, Search, Plus, Tag, Shield, FolderInput } from 'lucide-react'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui/Modal/Modal'
import styles from './DocumentView.module.css'
import { MOCK_DOCUMENTS, DocumentItem } from './mock-data'

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

  useEffect(() => {
    fetchDocuments(currentPath)
  }, [currentPath])

  const fetchDocuments = async (path: string) => {
    setIsLoading(true)
    // Mock network delay
    setTimeout(() => {
      // Filter mock documents by path
      let filtered = MOCK_DOCUMENTS.filter(doc => doc.key.startsWith(path) && doc.key !== path)
      // Basic mock logic to only show direct children
      filtered = filtered.filter(doc => {
        const remainingPath = doc.key.replace(path, '')
        if (doc.isDir) {
          return remainingPath.split('/').length === 2 // e.g. "Ca-phe-huu-co-2026/"
        }
        return !remainingPath.includes('/')
      })
      
      if (searchQuery) {
        filtered = MOCK_DOCUMENTS.filter(doc => doc.name.toLowerCase().includes(searchQuery.toLowerCase()))
      }
      
      setDocuments(filtered)
      setIsLoading(false)
    }, 400)
  }

  // Refetch when search query changes
  useEffect(() => {
    fetchDocuments(currentPath)
  }, [searchQuery])

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
    alert(`Mock action: ${download ? 'Download' : 'View'} ${key}`)
  }
  
  const handleMoveAction = (key: string) => {
    alert(`Mock action: Move document ${key}`)
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return

    setIsUploading(true)
    setUploadProgress(0)
    setUploadError(null)
    
    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval)
          return 90
        }
        return prev + 10
      })
    }, 200)

    // Simulate random failure (1 in 3 chance) to demonstrate retry state
    setTimeout(() => {
      clearInterval(interval)
      if (Math.random() < 0.3) {
        setUploadError('Lỗi mạng khi tải lên. Vui lòng thử lại.')
        setIsUploading(false)
      } else {
        setUploadProgress(100)
        setTimeout(() => {
          setIsUploadModalOpen(false)
          setUploadFile(null)
          setIsUploading(false)
          setUploadProgress(0)
          
          // Add to mock state
          const newDoc: DocumentItem = {
            id: Date.now().toString(),
            name: uploadFile.name,
            size: uploadFile.size,
            uploadDate: new Date(),
            key: currentPath + uploadFile.name,
            isDir: false,
            tags: ['mới'],
            privacy: 'Nội bộ HTX'
          }
          MOCK_DOCUMENTS.push(newDoc)
          fetchDocuments(currentPath)
        }, 500)
      }
    }, 2000)
  }
  
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) return
    
    const newDir: DocumentItem = {
      id: Date.now().toString(),
      name: newFolderName,
      size: 0,
      uploadDate: new Date(),
      key: `${currentPath}${newFolderName}/`,
      isDir: true,
      tags: [],
      privacy: 'Nội bộ HTX'
    }
    MOCK_DOCUMENTS.push(newDir)
    
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
            <div className="flex items-center gap-2 flex-1">
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
            
            <div className={styles.searchBox}>
              <Search size={16} className="text-gray-400" />
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
                          <Button variant="text" onClick={() => handleMoveAction(doc.key)} title="Di chuyển">
                            <FolderInput size={18} />
                          </Button>
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
            <input type="text" value={currentPath} disabled className="bg-gray-100" />
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
