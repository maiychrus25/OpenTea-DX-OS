// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Search, X, Map, User, Sprout, FileText, Package, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import styles from './GlobalSearch.module.css'

interface SearchResult {
  id: string
  title: string
  subtitle: string
  type: 'household' | 'parcel' | 'journal' | 'lot' | 'document' | 'partner'
  url: string
}

const MOCK_RESULTS: SearchResult[] = [
  { id: '1', title: 'Nguyễn Văn A', subtitle: 'Hộ thành viên', type: 'household', url: '/manager/members' },
  { id: '2', title: 'Thửa đất số 42', subtitle: 'Khu vực 1', type: 'parcel', url: '/manager/farm-zones' },
  { id: '3', title: 'Nhật ký bón phân Lô 12', subtitle: 'Ngày 12/08/2026', type: 'journal', url: '/manager/journal-approve' },
  { id: '4', title: 'Lô hàng LOT-2026-08', subtitle: 'Cà phê nhân', type: 'lot', url: '/manager/lots/LOT-2026-08' },
  { id: '5', title: 'Kế hoạch sản xuất.pdf', subtitle: 'Thư mục Projects', type: 'document', url: '/officer/documents' },
  { id: '6', title: 'Công ty TNHH ABC', subtitle: 'Đối tác mua hàng', type: 'partner', url: '/manager/partners' },
]

interface GlobalSearchProps {
  isOpen: boolean
  onClose: () => void
}

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setHasError(false)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    setHasError(false)

    const timer = setTimeout(() => {
      if (query.toLowerCase() === 'error') {
        setHasError(true)
        setResults([])
      } else {
        const filtered = MOCK_RESULTS.filter(r => 
          r.title.toLowerCase().includes(query.toLowerCase()) && 
          (activeFilter === 'all' || r.type === activeFilter)
        )
        setResults(filtered)
      }
      setIsSearching(false)
    }, 400)

    return () => clearTimeout(timer)
  }, [query, activeFilter])

  if (!isOpen) return null

  const getIconForType = (type: string) => {
    switch (type) {
      case 'household': return <User size={16} />
      case 'parcel': return <Map size={16} />
      case 'journal': return <Sprout size={16} />
      case 'lot': return <Package size={16} />
      case 'document': return <FileText size={16} />
      case 'partner': return <User size={16} />
      default: return <FileText size={16} />
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'household': return 'Thành viên'
      case 'parcel': return 'Thửa đất'
      case 'journal': return 'Nhật ký'
      case 'lot': return 'Lô hàng'
      case 'document': return 'Tài liệu'
      case 'partner': return 'Đối tác'
      default: return 'Khác'
    }
  }

  const FILTERS = [
    { id: 'all', label: 'Tất cả' },
    { id: 'household', label: 'Thành viên' },
    { id: 'lot', label: 'Lô hàng' },
    { id: 'document', label: 'Tài liệu' }
  ]

  // Group results by type
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.type]) acc[result.type] = []
    acc[result.type].push(result)
    return acc
  }, {} as Record<string, SearchResult[]>)

  return (
    <div className={styles.overlay} onClick={onClose} data-testid="global-search-overlay">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.searchHeader}>
          <Search size={20} className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Tìm kiếm thành viên, lô hàng, tài liệu... (gõ 'error' để test lỗi)"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.filters}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`${styles.filterPill} ${activeFilter === f.id ? styles.activeFilter : ''}`}
              onClick={() => setActiveFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className={styles.resultsContainer}>
          {isSearching && (
            <div className={styles.stateMessage}>Đang tìm kiếm...</div>
          )}

          {!isSearching && hasError && (
            <div className={styles.errorMessage}>
              <AlertCircle size={32} />
              <p>Lỗi kết nối. Không thể thực hiện tìm kiếm.</p>
              <button onClick={() => setQuery('')} className={styles.retryBtn}>Thử lại</button>
            </div>
          )}

          {!isSearching && !hasError && query && results.length === 0 && (
            <div className={styles.stateMessage}>
              Không tìm thấy kết quả nào cho &quot;{query}&quot;
            </div>
          )}

          {!isSearching && !hasError && results.length > 0 && (
            <div className={styles.groupedList}>
              {Object.entries(groupedResults).map(([type, items]) => (
                <div key={type} className={styles.group}>
                  <div className={styles.groupTitle}>{getTypeLabel(type)}</div>
                  {items.map(item => (
                    <Link href={item.url} key={item.id} className={styles.resultItem} onClick={onClose}>
                      <div className={styles.resultIcon}>
                        {getIconForType(item.type)}
                      </div>
                      <div className={styles.resultInfo}>
                        <div className={styles.resultTitle}>{item.title}</div>
                        <div className={styles.resultSubtitle}>{item.subtitle}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}

          {!query && (
            <div className={styles.idleState}>
              <p>Gõ từ khóa để bắt đầu tìm kiếm toàn cục.</p>
              <div className={styles.suggestions}>
                <span onClick={() => setQuery('Nguyễn')}>Nguyễn</span>
                <span onClick={() => setQuery('Lô')}>Lô hàng</span>
                <span onClick={() => setQuery('Tài liệu')}>Tài liệu</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
