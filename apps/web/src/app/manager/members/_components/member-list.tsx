// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Modal } from '@/components/ui/Modal';
import { Member } from './mock-data';
import { InvitationModal } from './invitation-modal';

export function MemberList() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'APPROVE' | 'DELETE' | null;
    memberId: string | null;
  }>({ isOpen: false, action: null, memberId: null });
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/members?role=farmer');
      if (!res.ok) throw new Error('Failed to fetch members');
      const json = await res.json();
      setMembers(json.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);



  const handleApprove = (id: string) => {
    setConfirmModal({ isOpen: true, action: 'APPROVE', memberId: id });
  };

  const handleDelete = (id: string) => {
    setConfirmModal({ isOpen: true, action: 'DELETE', memberId: id });
  };

  const executeConfirmAction = async () => {
    if (!confirmModal.memberId || !confirmModal.action) return;
    const { action, memberId } = confirmModal;
    
    setIsProcessing(true);
    try {
      if (action === 'APPROVE') {
        const res = await fetch(`/api/members/${memberId}/approve`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to approve member');
        await fetchMembers();
      } else if (action === 'DELETE') {
        const res = await fetch(`/api/members/${memberId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete member');
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      }
    } catch (error) {
      alert(`Đã xảy ra lỗi khi ${action === 'APPROVE' ? 'duyệt' : 'xóa'} thành viên.`);
    } finally {
      setIsProcessing(false);
      setConfirmModal({ isOpen: false, action: null, memberId: null });
    }
  };

  const getStatusBadgeVariant = (status: string): 'green' | 'amber' | 'neutral' => {
    switch (status) {
      case 'ACTIVE': return 'green';
      case 'PENDING': return 'amber';
      case 'LOCKED': return 'neutral';
      default: return 'neutral';
    }
  };

  const filteredMembers = members.filter(
    (m) => statusFilter === 'ALL' || m.status === statusFilter
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-2">
          <label htmlFor="statusFilter" className="text-sm font-medium text-[var(--color-ink-primary)]">
            Lọc theo trạng thái:
          </label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm text-[var(--color-ink-primary)]"
          >
            <option value="ALL">Tất cả</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="PENDING">Chờ xác nhận</option>
            <option value="LOCKED">Đã khóa</option>
          </select>
        </div>

        <Button onClick={() => setIsInviteModalOpen(true)} variant="primary">
          + Thêm thành viên
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-[var(--color-surface-sunken)] border-b border-[var(--border)]">
              <tr>
                <th scope="col" className="px-6 py-2.5 text-left text-xs font-semibold text-[var(--color-ink-secondary)] uppercase tracking-wider">
                  Thành viên
                </th>
                <th scope="col" className="px-6 py-2.5 text-left text-xs font-semibold text-[var(--color-ink-secondary)] uppercase tracking-wider">
                  Vai trò
                </th>
                <th scope="col" className="px-6 py-2.5 text-left text-xs font-semibold text-[var(--color-ink-secondary)] uppercase tracking-wider">
                  Trạng thái
                </th>
                <th scope="col" className="px-6 py-2.5 text-right text-xs font-semibold text-[var(--color-ink-secondary)] uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    Đang tải danh sách...
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    Không tìm thấy thành viên nào.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr key={member.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="ml-4">
                          <div className="text-sm font-medium text-[var(--color-ink-primary)]">
                            {member.full_name || member.name}
                          </div>
                          <div className="text-sm mt-1 text-[var(--color-ink-secondary)]">
                            {member.email} • {member.phone}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-ink-secondary)]">
                      {member.role === 'FARMER' && 'Nông dân'}
                      {member.role === 'OFFICER' && 'Cán bộ kỹ thuật'}
                      {member.role === 'MANAGER' && 'Trưởng HTX'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Pill tone={getStatusBadgeVariant(member.status)}>
                        {member.status === 'ACTIVE' && 'Hoạt động'}
                        {member.status === 'PENDING' && 'Chờ xác nhận'}
                        {member.status === 'LOCKED' && 'Đã khóa'}
                      </Pill>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {member.status === 'PENDING' && (
                        <button 
                          onClick={() => handleApprove(member.id)}
                          className="text-green-600 hover:text-green-900 ml-4 font-bold"
                        >
                          Duyệt
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(member.id)}
                        className="text-red-600 hover:text-red-900 ml-4"
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>



      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => !isProcessing && setConfirmModal({ isOpen: false, action: null, memberId: null })}
        title={confirmModal.action === 'APPROVE' ? 'Xác nhận duyệt' : 'Xác nhận xóa'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-[var(--color-ink-secondary)]">
            {confirmModal.action === 'APPROVE' 
              ? 'Bạn có chắc chắn muốn duyệt thành viên này? Họ sẽ có thể đăng nhập vào hệ thống.'
              : 'Bạn có chắc chắn muốn xóa thành viên này? Hành động này không thể hoàn tác.'}
          </p>
          <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border)]">
            <Button 
              variant="secondary" 
              onClick={() => setConfirmModal({ isOpen: false, action: null, memberId: null })}
              disabled={isProcessing}
            >
              Hủy
            </Button>
            <Button 
              variant={confirmModal.action === 'APPROVE' ? 'primary' : 'danger'}
              onClick={executeConfirmAction}
              disabled={isProcessing}
            >
              {isProcessing ? 'Đang xử lý...' : 'Xác nhận'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Invitation Modal */}
      <InvitationModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSuccess={() => fetchMembers()}
      />
    </div>
  );
}
