// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedFilter } from '@/components/ui/SegmentedFilter';
import table from '@/components/features/dashboard/dashboard.module.css';
import kit from '@/components/features/dashboard/page-kit.module.css';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Modal } from '@/components/ui/Modal';
import { Member } from './mock-data';
import { InvitationModal } from './invitation-modal';
import { toast } from 'sonner';

export function MemberList() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'APPROVE' | 'DELETE' | null;
    memberId: string | null;
  }>({ isOpen: false, action: null, memberId: null });
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/members');
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
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Failed to approve member');
        }
        await fetchMembers();
        toast.success('Đã duyệt thành viên thành công!');
      } else if (action === 'DELETE') {
        const res = await fetch(`/api/members/${memberId}`, { method: 'DELETE' });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Failed to delete member');
        }
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
        toast.success('Đã xóa thành viên thành công!');
      }
    } catch (error: unknown) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Lỗi không xác định'
      toast.error(errorMessage || `Đã xảy ra lỗi khi ${action === 'APPROVE' ? 'duyệt' : 'xóa'} thành viên.`);
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

  const needle = query.trim().toLowerCase();
  const filteredMembers = members.filter(
    (m) =>
      (statusFilter === 'ALL' || m.status === statusFilter) &&
      (!needle || [m.full_name, m.name, m.phone, m.email].some((v) => v?.toLowerCase().includes(needle)))
  );

  const countOf = (status: string) => members.filter((m) => m.status === status).length;
  const initials = (name = '') =>
    name.trim().split(/\s+/).slice(-2).map((part) => part.charAt(0)).join('').toUpperCase();

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Users size={28} />}
        title="Quản lý thành viên"
        description={
          loading
            ? 'Danh sách thành viên và lời mời tham gia hợp tác xã'
            : `${members.length} thành viên · ${countOf('PENDING')} đang chờ`
        }
        actions={
          <Button onClick={() => setIsInviteModalOpen(true)} variant="primary">
            <UserPlus size={16} aria-hidden="true" />
            + Thêm thành viên
          </Button>
        }
      />

      <div className={kit.card}>
        <div className={kit.toolbar}>
          <input
            type="search"
            className={kit.search}
            aria-label="Tìm thành viên"
            placeholder="Tìm theo tên, số điện thoại..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <SegmentedFilter
            label="Lọc theo trạng thái"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: 'Tất cả', count: members.length },
              { value: 'ACTIVE', label: 'Hoạt động', count: countOf('ACTIVE') },
              { value: 'PENDING', label: 'Chờ xác nhận', count: countOf('PENDING') },
              { value: 'LOCKED', label: 'Đã khóa', count: countOf('LOCKED') },
            ]}
          />
        </div>

        {loading ? (
          <div className={kit.state}>Đang tải danh sách...</div>
        ) : filteredMembers.length === 0 ? (
          <div className={kit.state}>Không tìm thấy thành viên nào.</div>
        ) : (
          <>
            <div className={table.tableWrap}>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th scope="col">STT</th>
                    <th scope="col">Thành viên</th>
                    <th scope="col">Vai trò</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member, index) => (
                    <tr key={member.id}>
                      <td>{index + 1}</td>
                      <td>
                        <div className={kit.person}>
                          <span className={kit.avatar} aria-hidden="true">
                            {initials(member.full_name || member.name)}
                          </span>
                          <div className={kit.personText}>
                            <strong>{member.full_name || member.name}</strong>
                            <small>
                              {[member.email, member.phone]
                                .filter((v) => v && v !== 'Chưa cập nhật')
                                .filter((v, i, a) => a.indexOf(v) === i)
                                .join(' • ') || 'Chưa cập nhật'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {member.role?.toUpperCase() === 'FARMER' && 'Nông dân'}
                        {member.role?.toUpperCase() === 'OFFICER' && 'Cán bộ kỹ thuật'}
                        {member.role?.toUpperCase() === 'MANAGER' && 'Trưởng HTX'}
                      </td>
                      <td>
                        <Pill tone={getStatusBadgeVariant(member.status)}>
                          {member.status === 'ACTIVE' && 'Hoạt động'}
                          {member.status === 'PENDING' && 'Chờ xác nhận'}
                          {member.status === 'LOCKED' && 'Đã khóa'}
                        </Pill>
                      </td>
                      <td>
                        <div className={kit.rowActions}>
                          {member.status === 'PENDING' && (
                            <button type="button" className={kit.linkButton} onClick={() => handleApprove(member.id)}>
                              Duyệt
                            </button>
                          )}
                          <button type="button" className={kit.dangerButton} onClick={() => handleDelete(member.id)}>
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={kit.footer}>Hiển thị {filteredMembers.length} / {members.length}</div>
          </>
        )}
      </div>

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
