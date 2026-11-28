// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Users, UserPlus, Download } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedFilter } from '@/components/ui/SegmentedFilter';
import table from '@/components/features/dashboard/dashboard.module.css';
import kit from '@/components/features/dashboard/page-kit.module.css';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Modal } from '@/components/ui/Modal';
import { Member, ROLE_LABELS as ROLE_NAME } from './member-types';
import { RolesDialog } from './roles-dialog';
import { InvitationModal } from './invitation-modal';
import { toast } from 'sonner';
import styles from './member-list.module.css';

export function MemberList() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  // Parcels and area per household, matched to a farmer by phone number.
  const [land, setLand] = useState<Record<string, { id: string; parcels: number; area: number }>>({});
  const [query, setQuery] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'APPROVE' | 'DELETE' | null;
    memberId: string | null;
  }>({ isOpen: false, action: null, memberId: null });
  const [isProcessing, setIsProcessing] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

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

  useEffect(() => {
    // Extra columns only: the list works without them.
    fetch('/api/farm/households')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) =>
        setLand(Object.fromEntries((json.data || []).map((h: { id: string; phone?: string; parcel_count?: number; total_area_ha?: number }) => [h.phone, { id: h.id, parcels: h.parcel_count ?? 0, area: h.total_area_ha ?? 0 }])))
      )
      .catch(() => setLand({}));
  }, []);



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
  // Every role of a person; older answers carry only `role`.
  const rolesOf = (m: Member): string[] => (m.roles?.length ? m.roles : [m.role?.toLowerCase()]).filter(Boolean) as string[];
  const roleText = (m: Member) => rolesOf(m).map((r) => ROLE_NAME[r] ?? r).join(', ');
  // People still waiting are asked about above; the table lists the members.
  const waiting = members.filter((m) => m.status === 'PENDING');
  const joined = members.filter((m) => m.status !== 'PENDING');
  const filteredMembers = joined.filter(
    (m) =>
      (roleFilter === 'ALL' || rolesOf(m).includes(roleFilter.toLowerCase())) &&
      (!needle || [m.full_name, m.name, m.phone, m.email].some((v) => v?.toLowerCase().includes(needle)))
  );

  const countRole = (role: string) => joined.filter((m) => rolesOf(m).includes(role.toLowerCase())).length;
  const phoneOf = (m: Member) => (m.phone && m.phone !== 'Chưa cập nhật' ? m.phone : '');
  const hectares = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

  const exportCsv = () => {
    // A leading quote keeps a cell that starts like a formula from being run by a spreadsheet.
    const cell = (value: string) => `"${(/^[=+\-@]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
    const rows = [
      ['Thành viên', 'Vai trò', 'Số điện thoại', 'Số thửa', 'Diện tích (ha)', 'Trạng thái'],
      ...filteredMembers.map((m) => [m.full_name || m.name || '', roleText(m), phoneOf(m), String(land[phoneOf(m)]?.parcels ?? ''), String(land[phoneOf(m)]?.area ?? ''), m.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa']),
    ];
    const url = URL.createObjectURL(new Blob([`\ufeff${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'thanh-vien.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
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
            : `${joined.length} thành viên · ${waiting.length} yêu cầu gia nhập đang chờ`
        }
        actions={
          <>
            <Button onClick={exportCsv} variant="secondary" disabled={filteredMembers.length === 0}>
              <Download size={16} aria-hidden="true" />
              Xuất danh sách
            </Button>
            <Button onClick={() => setIsInviteModalOpen(true)} variant="primary">
              <UserPlus size={16} aria-hidden="true" />
              + Thêm thành viên
            </Button>
          </>
        }
      />

      {waiting.length > 0 && (
        <section className={styles.waiting} aria-label="Yêu cầu gia nhập chờ duyệt">
          <h2>Yêu cầu gia nhập chờ duyệt <span>{waiting.length}</span></h2>
          <ul>
            {waiting.map((member) => (
              <li key={member.id}>
                <span className={kit.avatar} aria-hidden="true">{initials(member.full_name || member.name)}</span>
                <div className={kit.personText}>
                  <strong>{member.full_name || member.name}</strong>
                  <small>{[roleText(member), phoneOf(member)].filter(Boolean).join(' · ')}</small>
                </div>
                <Pill tone="amber">Chờ xác nhận</Pill>
                <button type="button" className={kit.dangerButton} onClick={() => handleDelete(member.id)}>Từ chối</button>
                <button type="button" className={kit.primary} onClick={() => handleApprove(member.id)}>Duyệt</button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
            label="Lọc theo vai trò"
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              { value: 'ALL', label: 'Tất cả', count: joined.length },
              { value: 'FARMER', label: 'Nông hộ', count: countRole('FARMER') },
              { value: 'OFFICER', label: 'Cán bộ KT', count: countRole('OFFICER') },
              { value: 'ACCOUNTANT', label: 'Kế toán', count: countRole('ACCOUNTANT') },
              { value: 'MANAGER', label: 'Trưởng HTX', count: countRole('MANAGER') },
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
                    <th scope="col">Số điện thoại</th>
                    <th scope="col">Số thửa</th>
                    <th scope="col">Diện tích</th>
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
                            {member.email && member.email !== 'Chưa cập nhật' && member.email !== member.phone && <small>{member.email}</small>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={styles.roleTags}>
                          {rolesOf(member).map((r) => <Pill key={r} tone="neutral">{ROLE_NAME[r] ?? r}</Pill>)}
                        </span>
                      </td>
                      <td>{phoneOf(member) || 'Chưa cập nhật'}</td>
                      <td>
                        {land[phoneOf(member)]
                          ? <Link href={`/manager/households/${land[phoneOf(member)].id}`} aria-label={`Chi tiết hộ ${member.full_name || member.name}`}>{land[phoneOf(member)].parcels}</Link>
                          : '—'}
                      </td>
                      <td>{land[phoneOf(member)] ? `${hectares(land[phoneOf(member)].area)} ha` : '—'}</td>
                      <td>
                        <Pill tone={getStatusBadgeVariant(member.status)}>
                          {member.status === 'ACTIVE' && 'Hoạt động'}
                          {member.status === 'LOCKED' && 'Đã khóa'}
                        </Pill>
                      </td>
                      <td>
                        <div className={kit.rowActions}>
                          <button type="button" className={kit.primary} onClick={() => setEditing(member)}>
                            Sửa vai
                          </button>
                          {!rolesOf(member).includes('manager') && (
                            <button type="button" className={kit.dangerButton} onClick={() => handleDelete(member.id)}>
                              Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={kit.footer}>Hiển thị {filteredMembers.length} / {joined.length}</div>
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

      {editing && (
        <RolesDialog
          memberId={editing.id}
          memberName={editing.full_name || editing.name}
          initialRoles={rolesOf(editing)}
          isManager={rolesOf(editing).includes('manager')}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success('Đã cập nhật vai thành công!');
            fetchMembers();
          }}
        />
      )}

      {/* Invitation Modal */}
      <InvitationModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSuccess={() => fetchMembers()}
      />
    </div>
  );
}
