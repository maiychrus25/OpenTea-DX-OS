// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface InvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (email: string, role: string) => Promise<void>;
}

export function InvitationModal({ isOpen, onClose, onInvite }: InvitationModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('FARMER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await onInvite(email, role);
      setEmail('');
      setRole('FARMER');
      onClose();
    } catch (error) {
      setErrorMsg('Đã có lỗi xảy ra khi gửi lời mời.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mời thành viên mới" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md">
            {errorMsg}
          </div>
        )}
        
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
          </label>
          <input
            type="email"
            id="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            placeholder="vd: nongdan@example.com"
          />
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Vai trò
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          >
            <option value="FARMER">Nông dân</option>
            <option value="OFFICER">Cán bộ kỹ thuật</option>
            <option value="MANAGER">Trưởng HTX</option>
          </select>
        </div>

        <div className="pt-4 flex justify-end space-x-3">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting || !email}>
            {isSubmitting ? 'Đang gửi...' : 'Gửi lời mời'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
