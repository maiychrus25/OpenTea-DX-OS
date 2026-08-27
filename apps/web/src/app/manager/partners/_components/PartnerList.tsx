// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { Phone, Mail, CheckCircle2, ShieldAlert, Edit, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal/Modal'
import { Button } from '@/components/ui'
import styles from './PartnerList.module.css'

interface Partner {
  id: string
  name: string
  type: string
  contactName: string
  phone: string
  email: string
  verified: boolean
}

const MOCK_PARTNERS: Partner[] = [
  {
    id: 'p1',
    name: 'Công ty Thu mua Nông sản Xanh',
    type: 'Người mua',
    contactName: 'Trần Văn B',
    phone: '0987654321',
    email: 'contact@nongsanxanh.com',
    verified: true
  },
  {
    id: 'p2',
    name: 'Đại lý Phân bón An Phát',
    type: 'Nhà cung cấp',
    contactName: 'Lê Thị C',
    phone: '0912345678',
    email: 'anphat@gmail.com',
    verified: true
  },
  {
    id: 'p3',
    name: 'Hệ thống Siêu thị Co-op',
    type: 'Người mua',
    contactName: 'Phạm Đức D',
    phone: '0909090909',
    email: 'purchasing@coop.vn',
    verified: false
  }
]

export function PartnerList() {
  const [partners, setPartners] = useState<Partner[]>(MOCK_PARTNERS)
  const [partnerToDelete, setPartnerToDelete] = useState<Partner | null>(null)
  
  const handleDelete = () => {
    if (partnerToDelete) {
      setPartners(partners.filter(p => p.id !== partnerToDelete.id))
      setPartnerToDelete(null)
    }
  }

  return (
    <div className={styles.container}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Tên đối tác</th>
            <th>Phân loại</th>
            <th>Người liên hệ</th>
            <th>Xác thực</th>
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
                    <div className={styles.contactLinks}>
                      <a href={`tel:${partner.phone}`} className={styles.link}><Phone size={12}/> {partner.phone}</a>
                      {partner.email && <a href={`mailto:${partner.email}`} className={styles.link}><Mail size={12}/> {partner.email}</a>}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <span className={styles.badge}>{partner.type}</span>
              </td>
              <td>{partner.contactName}</td>
              <td>
                {partner.verified ? (
                  <div className={styles.verifiedBadge}>
                    <CheckCircle2 size={14} /> Đã xác thực
                  </div>
                ) : (
                  <div className={styles.unverifiedBadge}>
                    <ShieldAlert size={14} /> Chưa xác thực
                  </div>
                )}
              </td>
              <td>
                <div className={styles.actions}>
                  <button className={styles.actionBtn} title="Sửa thông tin" onClick={() => alert('Mock: Mở modal sửa đối tác')}>
                    <Edit size={16} />
                  </button>
                  <button className={`${styles.actionBtn} ${styles.danger}`} title="Xóa đối tác" onClick={() => setPartnerToDelete(partner)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {partners.length === 0 && (
            <tr>
              <td colSpan={5} className={styles.empty}>Không có đối tác nào.</td>
            </tr>
          )}
        </tbody>
      </table>

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
            <Button variant="secondary" onClick={() => setPartnerToDelete(null)}>Hủy</Button>
            <Button variant="primary" onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Xóa đối tác</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
