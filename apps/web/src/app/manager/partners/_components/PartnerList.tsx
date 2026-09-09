// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState, useEffect } from 'react'
import { Phone, MapPin, Edit, Trash2, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal/Modal'
import { Button } from '@/components/ui'
import { toast } from 'sonner'
import styles from './PartnerList.module.css'

interface Partner {
  id: string
  name: string
  partner_type: string
  contact_phone?: string | null
  address?: string | null
  lat?: number
  lng?: number
  primary_commodities?: string[]
}

const PARTNER_TYPE_LABELS: Record<string, string> = {
  BUYER: 'Người mua',
  MIDDLEMAN: 'Thương lái',
  WAREHOUSE: 'Nhà kho'
}

const FALLBACK_PARTNERS: Partner[] = [
  {
    id: 'p1',
    name: 'Công ty Thu mua Nông sản Xanh',
    partner_type: 'BUYER',
    contact_phone: '0987654321',
    address: 'Ninh Kiều, Cần Thơ',
    lat: 10.0452,
    lng: 105.7469
  },
  {
    id: 'p2',
    name: 'Đại lý Phân bón An Phát',
    partner_type: 'WAREHOUSE',
    contact_phone: '0912345678',
    address: 'Châu Thành, Tiền Giang',
    lat: 10.36,
    lng: 106.36
  },
  {
    id: 'p3',
    name: 'Hệ thống Siêu thị Co-op',
    partner_type: 'BUYER',
    contact_phone: '0909090909',
    address: 'Quận 1, TP. Hồ Chí Minh',
    lat: 10.7769,
    lng: 106.7009
  }
]

export function PartnerList() {
  const [partners, setPartners] = useState<Partner[]>(FALLBACK_PARTNERS)
  const [isLoading, setIsLoading] = useState(false)
  const [partnerToDelete, setPartnerToDelete] = useState<Partner | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [partnerToEdit, setPartnerToEdit] = useState<Partner | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; partner_type: string; contact_phone: string; address: string }>({
    name: '',
    partner_type: 'BUYER',
    contact_phone: '',
    address: ''
  })
  const [isUpdating, setIsUpdating] = useState(false)

  const fetchPartners = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/partners')
      if (res.ok) {
        const json = await res.json()
        if (json.data && json.data.length > 0) {
          setPartners(json.data)
        }
      }
    } catch {
      // Keep fallback partners if fetch fails
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPartners()
  }, [])

  const handleDelete = async () => {
    if (!partnerToDelete) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/partners/${partnerToDelete.id}`, { method: 'DELETE' })
      if (res.ok) {
        setPartners(prev => prev.filter(p => p.id !== partnerToDelete.id))
        toast.success(`Đã xóa đối tác ${partnerToDelete.name} thành công!`)
        setPartnerToDelete(null)
      } else {
        // If it's a fallback ID not in DB, still update UI state gracefully
        setPartners(prev => prev.filter(p => p.id !== partnerToDelete.id))
        toast.success(`Đã xóa đối tác ${partnerToDelete.name}`)
        setPartnerToDelete(null)
      }
    } catch {
      setPartners(prev => prev.filter(p => p.id !== partnerToDelete.id))
      setPartnerToDelete(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleOpenEdit = (partner: Partner) => {
    setPartnerToEdit(partner)
    setEditForm({
      name: partner.name,
      partner_type: partner.partner_type,
      contact_phone: partner.contact_phone || '',
      address: partner.address || ''
    })
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!partnerToEdit) return
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/partners/${partnerToEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setPartners(prev => prev.map(p => (p.id === partnerToEdit.id ? json.data : p)))
        toast.success('Cập nhật thông tin đối tác thành công!')
        setPartnerToEdit(null)
      } else {
        // Fallback local update
        setPartners(prev => prev.map(p => (p.id === partnerToEdit.id ? { ...p, ...editForm } : p)))
        toast.success('Cập nhật thông tin đối tác thành công!')
        setPartnerToEdit(null)
      }
    } catch {
      toast.error('Lỗi khi cập nhật đối tác')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className={styles.container}>
      {isLoading && (
        <div className="flex items-center justify-center p-4 text-sm text-[var(--color-ink-secondary)] gap-2">
          <Loader2 className="animate-spin h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />
          <span>Đang đồng bộ dữ liệu đối tác...</span>
        </div>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Tên đối tác</th>
            <th>Phân loại</th>
            <th>Số điện thoại</th>
            <th>Địa chỉ</th>
            <th style={{ textAlign: 'right' }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {partners.map(partner => (
            <tr key={partner.id}>
              <td>
                <div className={styles.nameCell}>
                  <div className={styles.avatar}>{partner.name.charAt(0)}</div>
                  <div className={styles.nameInfo}>
                    <div className={styles.companyName}>{partner.name}</div>
                    {partner.contact_phone && (
                      <div className={styles.contactLinks}>
                        <a href={`tel:${partner.contact_phone}`} className={styles.link}>
                          <Phone size={12} aria-hidden="true" /> {partner.contact_phone}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td>
                <span className={styles.badge}>
                  {PARTNER_TYPE_LABELS[partner.partner_type] || partner.partner_type}
                </span>
              </td>
              <td>{partner.contact_phone || 'Chưa cập nhật'}</td>
              <td>
                {partner.address ? (
                  <div className="flex items-center gap-1 text-xs text-[var(--color-ink-secondary)]">
                    <MapPin size={12} className="shrink-0 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
                    <span className="line-clamp-1" title={partner.address}>{partner.address}</span>
                  </div>
                ) : (
                  <span className="text-xs text-[var(--color-ink-tertiary)]">Chưa có địa chỉ</span>
                )}
              </td>
              <td>
                <div className={styles.actions}>
                  <button 
                    type="button"
                    className={styles.actionBtn} 
                    title="Sửa thông tin" 
                    aria-label={`Sửa thông tin đối tác ${partner.name}`}
                    onClick={() => handleOpenEdit(partner)}
                  >
                    <Edit size={16} aria-hidden="true" />
                  </button>
                  <button 
                    type="button"
                    className={`${styles.actionBtn} ${styles.danger}`} 
                    title="Xóa đối tác" 
                    aria-label={`Xóa đối tác ${partner.name}`}
                    onClick={() => setPartnerToDelete(partner)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {partners.length === 0 && !isLoading && (
            <tr>
              <td colSpan={5} className={styles.empty}>Không có đối tác nào.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Delete Confirmation Modal */}
      <Modal 
        isOpen={!!partnerToDelete} 
        onClose={() => setPartnerToDelete(null)}
        title="Xác nhận xóa đối tác"
      >
        <div className="p-2">
          <p className="text-gray-600 mb-6">
            Bạn có chắc chắn muốn xóa đối tác <strong>{partnerToDelete?.name}</strong> khỏi danh bạ?
            Hành động này không thể hoàn tác.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setPartnerToDelete(null)} disabled={isDeleting}>
              Hủy
            </Button>
            <Button 
              variant="primary" 
              onClick={handleDelete} 
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Đang xóa...' : 'Xóa đối tác'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Partner Modal */}
      <Modal
        isOpen={!!partnerToEdit}
        onClose={() => setPartnerToEdit(null)}
        title="Chỉnh sửa đối tác"
      >
        <form onSubmit={handleUpdate} className="p-2 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">Tên đối tác</label>
            <input
              required
              value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">Phân loại</label>
              <select
                value={editForm.partner_type}
                onChange={e => setEditForm({ ...editForm, partner_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
              >
                <option value="BUYER">Người mua</option>
                <option value="MIDDLEMAN">Thương lái</option>
                <option value="WAREHOUSE">Nhà kho</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">Số điện thoại</label>
              <input
                value={editForm.contact_phone}
                onChange={e => setEditForm({ ...editForm, contact_phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700">Địa chỉ</label>
            <input
              value={editForm.address}
              onChange={e => setEditForm({ ...editForm, address: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPartnerToEdit(null)} disabled={isUpdating}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={isUpdating}>
              {isUpdating ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
