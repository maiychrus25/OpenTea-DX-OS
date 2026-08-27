// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { mockMembers, Member, MemberRole } from './mock-data';
import { InvitationModal } from './invitation-modal';

export function MemberList() {
  const [members, setMembers] = useState<Member[]>(mockMembers);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const handleInvite = async (email: string, role: string) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    const newMember: Member = {
      id: `m${Date.now()}`,
      name: 'Chưa cập nhật',
      email,
      phone: 'Chưa cập nhật',
      role: role as MemberRole,
      status: 'PENDING',
      invitedAt: new Date().toISOString(),
    };
    
    setMembers((prev) => [newMember, ...prev]);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa thành viên này? Hành động này không thể hoàn tác.')) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
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
          <label htmlFor="statusFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Lọc theo trạng thái:
          </label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          >
            <option value="ALL">Tất cả</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="PENDING">Chờ xác nhận</option>
            <option value="LOCKED">Đã khóa</option>
          </select>
        </div>

        <Button onClick={() => setIsInviteModalOpen(true)} variant="primary">
          Mời thành viên
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Thành viên
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Vai trò
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Trạng thái
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 dark:bg-transparent dark:divide-gray-700">
              {filteredMembers.map((member) => (
                <tr key={member.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {member.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {member.email} • {member.phone}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
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
                    <button 
                      onClick={() => handleDelete(member.id)}
                      className="text-red-600 hover:text-red-900 dark:hover:text-red-400 ml-4"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    Không tìm thấy thành viên nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <InvitationModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={handleInvite}
      />
    </div>
  );
}
